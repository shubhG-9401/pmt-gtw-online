import { signHmac } from '@pmt/common';

export class WebhookEngine {
  /**
   * @param {object} dependencies
   * @param {import('@pmt/db').WebhookRepository} dependencies.webhookRepo
   * @param {import('@pmt/db').MerchantRepository} dependencies.merchantRepo
   */
  constructor({ webhookRepo, merchantRepo }) {
    this.webhookRepo = webhookRepo;
    this.merchantRepo = merchantRepo;
  }

  /**
   * Dispatches a single webhook record.
   * @param {object} webhookRecord
   * @returns {Promise<{ success: boolean, statusCode: number, error?: string }>}
   */
  async dispatch(webhookRecord) {
    const merchant = this.merchantRepo.findById(webhookRecord.merchant_id);
    if (!merchant || !merchant.webhook_url) {
      this.webhookRepo.recordFailure(webhookRecord.id, 400, null);
      return { success: false, statusCode: 400, error: 'NO_WEBHOOK_URL' };
    }

    const timestamp = Date.now().toString();
    const signature = signHmac(`${timestamp}.${webhookRecord.payload}`, merchant.webhook_secret);

    try {
      const response = await fetch(merchant.webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PMT-Signature': signature,
          'X-PMT-Timestamp': timestamp,
          'User-Agent': 'PMT-GTW-Webhook/2.0'
        },
        body: webhookRecord.payload,
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        this.webhookRepo.recordSuccess(webhookRecord.id, response.status);
        return { success: true, statusCode: response.status };
      }

      // Calculate exponential backoff retry in minutes: 1, 5, 15, 60
      const retryIntervals = [1, 5, 15, 60];
      const nextInterval = retryIntervals[webhookRecord.attempts] || null;

      this.webhookRepo.recordFailure(webhookRecord.id, response.status, nextInterval);
      return { success: false, statusCode: response.status };
    } catch (err) {
      const retryIntervals = [1, 5, 15, 60];
      const nextInterval = retryIntervals[webhookRecord.attempts] || null;
      this.webhookRepo.recordFailure(webhookRecord.id, 0, nextInterval);
      return { success: false, statusCode: 0, error: err.message };
    }
  }

  /**
   * Processes all pending webhooks in the queue.
   */
  async processPendingQueue() {
    const pending = this.webhookRepo.getPending(10);
    const results = [];
    for (const record of pending) {
      results.push(await this.dispatch(record));
    }
    return results;
  }
}
