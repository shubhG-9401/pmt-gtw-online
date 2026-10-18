import http from 'node:http';
import { URL } from 'node:url';
import {
  getDatabase,
  MerchantRepository,
  PaymentRepository,
  CustomerRepository,
  ObserverRepository,
  WebhookRepository
} from '@pmt/db';
import {
  AttributionEngine,
  attributionEvents,
  QueueEngine,
  TimingEngine,
  WebhookEngine,
  generateQrSvg,
  parseBankSms
} from '@pmt/core';
import {
  buildUpiUrl,
  buildIntentUrls,
  RateLimiter,
  signHmac,
  verifyHmac,
  safeEqual,
  getAdminToken
} from '@pmt/common';

/**
 * Reads JSON payload from an HTTP request.
 * @param {http.IncomingMessage} req
 * @returns {Promise<any>}
 */
export async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Merchant-Id, X-Device-Id, X-Signature, X-Timestamp'
  });
  res.end(JSON.stringify(data));
}

export class PaymentApiServer {
  /**
   * @param {object} [options={}]
   * @param {import('@pmt/db').Database} [options.db]
   */
  constructor(options = {}) {
    this.db = options.db || getDatabase();
    this.merchantRepo = new MerchantRepository(this.db);
    this.paymentRepo = new PaymentRepository(this.db);
    this.customerRepo = new CustomerRepository(this.db);
    this.observerRepo = new ObserverRepository(this.db);
    this.webhookRepo = new WebhookRepository(this.db);

    this.queueEngine = new QueueEngine(this.db);
    this.timingEngine = new TimingEngine({ db: this.db, queueEngine: this.queueEngine });
    this.webhookEngine = new WebhookEngine({
      webhookRepo: this.webhookRepo,
      merchantRepo: this.merchantRepo
    });
    this.attributionEngine = new AttributionEngine({
      paymentRepo: this.paymentRepo,
      observerRepo: this.observerRepo,
      webhookRepo: this.webhookRepo,
      merchantRepo: this.merchantRepo
    });

    this.rateLimiter = new RateLimiter({ windowMs: 60000, max: 20 });
    this.portalBaseUrl = process.env.BASE_CHECKOUT_URL || 'http://localhost:7000';
  }

  createServer() {
    return http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;
      const method = req.method;

      // Handle CORS Preflight
      if (method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Merchant-Id, X-Device-Id, X-Signature, X-Timestamp'
        });
        res.end();
        return;
      }

      try {
        // --- Health Check ---
        if (pathname === '/api/v1/health') {
          return sendJson(res, 200, {
            status: 'HEALTHY',
            service: 'pmt-gateway-api',
            timestamp: new Date().toISOString()
          });
        }

        // --- Create Payment Session ---
        if (pathname === '/api/v1/payments' && method === 'POST') {
          const body = await parseJsonBody(req);
          const { amount, orderId, customerMobile, customerName, mode = 'ONLINE' } = body;

          if (!amount || Number(amount) <= 0) {
            return sendJson(res, 400, { success: false, message: 'Invalid or missing amount' });
          }

          // Merchant resolution (Header or default)
          let merchant = null;
          const authHeader = req.headers['authorization'];
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.replace(/^Bearer\s+/, '').trim();
            merchant = this.merchantRepo.findByApiKey(token);
          }
          if (!merchant) {
            merchant = this.merchantRepo.getDefaultMerchant();
          }
          if (!merchant) {
            return sendJson(res, 500, { success: false, message: 'No active merchant configured' });
          }

          // Build standard UPI URL for this payment
          const payment = this.paymentRepo.create({
            merchantId: merchant.id,
            amount,
            orderId,
            customerMobile,
            customerName,
            mode,
            expirySeconds: Number(process.env.PAYMENT_EXPIRY_SECONDS || 300)
          });

          const upiUrl = buildUpiUrl({
            pa: merchant.vpa,
            pn: merchant.name,
            am: payment.amount,
            tr: payment.id,
            tn: `PMT Order ${payment.order_id || payment.id.slice(0, 8)}`
          });

          this.paymentRepo.updateStatus(payment.id, payment.status, { upiUri: upiUrl });

          // Attempt queue slot acquisition
          const queueResult = this.queueEngine.enqueue(merchant.vpa, payment.id, 300);

          const intents = buildIntentUrls(upiUrl);
          const checkoutUrl = `${this.portalBaseUrl}/checkout/${payment.id}`;

          return sendJson(res, 201, {
            success: true,
            payment: {
              id: payment.id,
              orderId: payment.order_id,
              amount: payment.amount,
              currency: payment.currency,
              status: queueResult.status === 'ACTIVE' ? 'ACTIVE' : 'QUEUED',
              queuePosition: queueResult.position,
              upiUrl,
              intents,
              checkoutUrl,
              expiresAt: payment.expires_at
            }
          });
        }

        // --- Get Payment Status ---
        const paymentIdMatch = /^\/api\/v1\/payments\/([a-zA-Z0-9_\-]+)$/.exec(pathname);
        if (paymentIdMatch && method === 'GET') {
          const paymentId = paymentIdMatch[1];
          const payment = this.paymentRepo.findById(paymentId);
          if (!payment) {
            return sendJson(res, 404, { success: false, message: 'Payment not found' });
          }

          const queueStatus = this.queueEngine.getStatus(payment.id);
          const merchant = this.merchantRepo.findById(payment.merchant_id);

          return sendJson(res, 200, {
            success: true,
            payment: {
              ...payment,
              queuePosition: queueStatus.position,
              queueStatus: queueStatus.status,
              merchantName: merchant ? merchant.name : 'PMT Merchant',
              merchantVpa: merchant ? merchant.vpa : ''
            }
          });
        }

        // --- Cancel Payment Session ---
        const cancelMatch = /^\/api\/v1\/payments\/([a-zA-Z0-9_\-]+)\/cancel$/.exec(pathname);
        if (cancelMatch && method === 'POST') {
          const paymentId = cancelMatch[1];
          const payment = this.paymentRepo.findById(paymentId);
          if (!payment) {
            return sendJson(res, 404, { success: false, message: 'Payment not found' });
          }

          this.paymentRepo.markCancelled(paymentId);
          const merchant = this.merchantRepo.findById(payment.merchant_id);
          if (merchant) {
            this.queueEngine.releaseSlot(merchant.vpa, paymentId);
          }

          return sendJson(res, 200, { success: true, message: 'Payment cancelled successfully' });
        }

        // --- Real-Time Server-Sent Events (SSE) Stream ---
        const sseMatch = /^\/api\/v1\/payments\/([a-zA-Z0-9_\-]+)\/sse$/.exec(pathname);
        if (sseMatch && method === 'GET') {
          const paymentId = sseMatch[1];
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
          });

          // Send immediate current status
          const current = this.paymentRepo.findById(paymentId);
          if (current) {
            res.write(`data: ${JSON.stringify(current)}\n\n`);
          }

          // Event listener for updates
          const onUpdate = (updated) => {
            if (updated.id === paymentId) {
              res.write(`data: ${JSON.stringify(updated)}\n\n`);
              if (['SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(updated.status)) {
                cleanup();
              }
            }
          };

          const keepAlive = setInterval(() => {
            res.write(': keepalive\n\n');
          }, 15000);

          const cleanup = () => {
            attributionEvents.off(`payment:${paymentId}`, onUpdate);
            clearInterval(keepAlive);
            try { res.end(); } catch {}
          };

          attributionEvents.on(`payment:${paymentId}`, onUpdate);
          req.on('close', cleanup);
          return;
        }

        // --- Customer OTP Dispatch ---
        if (pathname === '/api/v1/customer/send-otp' && method === 'POST') {
          const body = await parseJsonBody(req);
          const { mobileNumber } = body;
          if (!mobileNumber || mobileNumber.length < 10) {
            return sendJson(res, 400, { success: false, message: 'Valid 10-digit mobile number required' });
          }

          const rateCheck = this.rateLimiter.consume(`otp_${mobileNumber}`);
          if (!rateCheck.allowed) {
            return sendJson(res, 429, { success: false, message: 'Please wait before requesting another OTP' });
          }

          // Generate 6-digit OTP
          const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
          this.customerRepo.saveOtp(mobileNumber, otpCode);

          return sendJson(res, 200, {
            success: true,
            message: 'OTP dispatched successfully',
            // Provided in dev/test mode for automated verification
            devOtp: process.env.NODE_ENV !== 'production' ? otpCode : undefined
          });
        }

        // --- Customer OTP Verification ---
        if (pathname === '/api/v1/customer/verify-otp' && method === 'POST') {
          const body = await parseJsonBody(req);
          const { mobileNumber, otp } = body;
          if (!mobileNumber || !otp) {
            return sendJson(res, 400, { success: false, message: 'Mobile number and OTP are required' });
          }

          const verification = this.customerRepo.verifyOtp(mobileNumber, otp);
          if (!verification.valid) {
            return sendJson(res, 400, { success: false, message: 'Invalid or expired OTP' });
          }

          const customer = this.customerRepo.createOrUpdate({ mobileNumber });
          const token = signHmac(`${customer.id}.${Date.now()}`, 'pmt_jwt_temp_key');

          return sendJson(res, 200, {
            success: true,
            token,
            customer
          });
        }

        // --- Observer Ingest Endpoint (Bank SMS & Notifications) ---
        if (pathname === '/api/v1/observer/events' && method === 'POST') {
          const body = await parseJsonBody(req);
          const { observerType, rawPayload, amount, utr, sender, payerVpa } = body;

          // If raw text is provided without pre-parsed fields, parse it on the fly
          let parsedAmount = amount;
          let parsedUtr = utr;
          let parsedPayer = payerVpa;

          if (rawPayload && typeof rawPayload === 'string' && (!amount || !utr)) {
            const parsed = parseBankSms(rawPayload, sender || '');
            if (parsed.isCredit) {
              parsedAmount = parsed.amount;
              parsedUtr = parsed.utr;
              parsedPayer = parsed.payerVpa;
            }
          }

          const matchResult = await this.attributionEngine.processCreditEvent({
            observerType: observerType || 'BANK_OBSERVER',
            rawPayload,
            amount: parsedAmount,
            utr: parsedUtr,
            sender,
            payerVpa: parsedPayer
          });

          return sendJson(res, 200, {
            success: true,
            ...matchResult
          });
        }

        // --- Observer Device Heartbeat ---
        if (pathname === '/api/v1/observer/heartbeat' && method === 'POST') {
          const deviceId = req.headers['x-device-id'] || 'default_device';
          this.observerRepo.updateHeartbeat(deviceId);
          return sendJson(res, 200, { success: true, timestamp: new Date().toISOString() });
        }

        // --- Admin Simulator: Simulate Bank Credit ---
        if (pathname === '/api/v1/admin/simulate-credit' && method === 'POST') {
          const body = await parseJsonBody(req);
          const { paymentId, amount, utr } = body;

          const payment = paymentId ? this.paymentRepo.findById(paymentId) : null;
          const targetAmount = amount || (payment ? payment.amount : 100);
          const simUtr = utr || `SIM${Date.now().toString().slice(-9)}`;

          const matchResult = await this.attributionEngine.processCreditEvent({
            observerType: 'SIMULATOR',
            rawPayload: `Simulated Bank Credit of INR ${targetAmount} with UTR ${simUtr}`,
            amount: Number(targetAmount),
            utr: simUtr,
            preferredPaymentId: paymentId
          });

          return sendJson(res, 200, {
            success: true,
            simulated: true,
            ...matchResult
          });
        }

        // --- Admin Dashboard Metrics ---
        if (pathname === '/api/v1/admin/metrics' && method === 'GET') {
          const metrics = this.paymentRepo.getMetrics();
          const observers = this.observerRepo.listDevices();
          const recentEvents = this.observerRepo.listEvents(10);

          return sendJson(res, 200, {
            success: true,
            metrics,
            observers,
            recentEvents
          });
        }

        // --- Admin Transactions Ledger ---
        if (pathname === '/api/v1/admin/transactions' && method === 'GET') {
          const status = url.searchParams.get('status') || undefined;
          const search = url.searchParams.get('search') || undefined;
          const limit = Number(url.searchParams.get('limit')) || 50;

          const transactions = this.paymentRepo.list({ status, search, limit });
          return sendJson(res, 200, { success: true, transactions });
        }

        // --- Admin Counter Till Approval ---
        if (pathname === '/api/v1/admin/counter/approve' && method === 'POST') {
          const body = await parseJsonBody(req);
          const { paymentId, paymentMethod = 'CASH' } = body;

          const payment = this.paymentRepo.findById(paymentId);
          if (!payment) {
            return sendJson(res, 404, { success: false, message: 'Payment not found' });
          }

          const utr = `TILL_${paymentMethod}_${Date.now().toString().slice(-8)}`;
          const updated = this.paymentRepo.markSuccess(paymentId, {
            utr,
            observationChannel: `COUNTER_${paymentMethod}`
          });

          attributionEvents.emit(`payment:${paymentId}`, updated);
          return sendJson(res, 200, { success: true, payment: updated });
        }

        // --- 404 Not Found Fallback ---
        return sendJson(res, 404, { success: false, message: `Route not found: ${pathname}` });

      } catch (err) {
        return sendJson(res, 500, { success: false, message: err.message });
      }
    });
  }
}
