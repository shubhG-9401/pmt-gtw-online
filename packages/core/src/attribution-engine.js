import EventEmitter from 'node:events';

export const attributionEvents = new EventEmitter();

export class AttributionEngine {
  /**
   * @param {object} dependencies
   * @param {import('@pmt/db').PaymentRepository} dependencies.paymentRepo
   * @param {import('@pmt/db').ObserverRepository} dependencies.observerRepo
   * @param {import('@pmt/db').WebhookRepository} dependencies.webhookRepo
   * @param {import('@pmt/db').MerchantRepository} dependencies.merchantRepo
   */
  constructor({ paymentRepo, observerRepo, webhookRepo, merchantRepo }) {
    this.paymentRepo = paymentRepo;
    this.observerRepo = observerRepo;
    this.webhookRepo = webhookRepo;
    this.merchantRepo = merchantRepo;
  }

  /**
   * Process an incoming verified bank credit alert.
   * @param {object} event
   * @param {string} event.observerType - e.g. 'ANDROID_SMS', 'GMAIL', 'SIMULATOR'
   * @param {string|object} event.rawPayload
   * @param {number} event.amount
   * @param {string} event.utr
   * @param {string} [event.sender]
   * @param {string} [event.payerVpa]
   * @param {string} [event.preferredPaymentId] - Explicit payment ID if provided by simulator or till
   * @returns {Promise<{ matched: boolean, payment: object|null, reason: string }>}
   */
  async processCreditEvent({
    observerType,
    rawPayload,
    amount,
    utr,
    sender = '',
    payerVpa = null,
    preferredPaymentId = null
  }) {
    if (!amount || Number(amount) <= 0) {
      return { matched: false, payment: null, reason: 'INVALID_AMOUNT' };
    }
    if (!utr || typeof utr !== 'string') {
      return { matched: false, payment: null, reason: 'MISSING_UTR' };
    }

    const cleanUtr = utr.trim();

    // 1. Anti-Replay: Check if UTR was already matched to a successful payment
    const existingPaymentWithUtr = this.paymentRepo.findByUtr(cleanUtr);
    if (existingPaymentWithUtr) {
      this.observerRepo.recordEvent({
        observerType,
        rawPayload,
        parsedAmount: amount,
        parsedUtr: cleanUtr,
        parsedSender: sender,
        matchedPaymentId: existingPaymentWithUtr.id,
        status: 'DUPLICATE'
      });
      return { matched: false, payment: existingPaymentWithUtr, reason: 'DUPLICATE_UTR' };
    }

    // 2. If explicit payment ID is targeted (e.g. counter till or manual settlement)
    let candidate = null;
    if (preferredPaymentId) {
      candidate = this.paymentRepo.findById(preferredPaymentId);
      if (candidate && candidate.status === 'SUCCESS') {
        return { matched: false, payment: candidate, reason: 'PAYMENT_ALREADY_SUCCESS' };
      }
    }

    // 3. Automated matching against active candidate sessions
    if (!candidate) {
      const candidates = this.paymentRepo.findPendingForMatching(amount, 900); // 15-minute search window
      if (candidates.length > 0) {
        candidate = candidates[0]; // Earliest active candidate matching exact amount
      }
    }

    if (!candidate) {
      // Record unattached credit event for manual reconciliation
      this.observerRepo.recordEvent({
        observerType,
        rawPayload,
        parsedAmount: amount,
        parsedUtr: cleanUtr,
        parsedSender: sender,
        status: 'PENDING'
      });
      return { matched: false, payment: null, reason: 'NO_MATCHING_PENDING_PAYMENT' };
    }

    // 4. Mark payment as SUCCESS
    const updatedPayment = this.paymentRepo.markSuccess(candidate.id, {
      utr: cleanUtr,
      payerVpa: payerVpa || candidate.payer_vpa,
      observationChannel: observerType
    });

    // 5. Record event in observer log as MATCHED
    this.observerRepo.recordEvent({
      observerType,
      rawPayload,
      parsedAmount: amount,
      parsedUtr: cleanUtr,
      parsedSender: sender,
      matchedPaymentId: candidate.id,
      status: 'MATCHED'
    });

    // 6. Enqueue Webhook for merchant
    const merchant = this.merchantRepo.findById(candidate.merchant_id);
    if (merchant && merchant.webhook_url) {
      const webhookPayload = {
        event: 'payment.success',
        data: {
          id: updatedPayment.id,
          orderId: updatedPayment.order_id,
          amount: updatedPayment.amount,
          currency: updatedPayment.currency,
          status: updatedPayment.status,
          utr: updatedPayment.utr,
          payerVpa: updatedPayment.payer_vpa,
          channel: observerType,
          createdAt: updatedPayment.created_at,
          paidAt: updatedPayment.updated_at
        }
      };

      this.webhookRepo.enqueue({
        paymentId: updatedPayment.id,
        merchantId: merchant.id,
        event: 'payment.success',
        payload: webhookPayload
      });
    }

    // 7. Emit real-time event for SSE / WebSockets
    attributionEvents.emit('payment.updated', updatedPayment);
    attributionEvents.emit(`payment:${updatedPayment.id}`, updatedPayment);

    return { matched: true, payment: updatedPayment, reason: 'MATCH_SUCCESS' };
  }
}
