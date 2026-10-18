import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PmtMerchantClient } from '@pmt/merchant-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsDir = path.join(__dirname, 'views');

export class DemoStoreServer {
  /**
   * @param {object} [options={}]
   * @param {string} [options.apiBaseUrl]
   */
  constructor(options = {}) {
    this.apiBaseUrl = options.apiBaseUrl || process.env.BASE_PAYMENT_API_URL || 'http://localhost:6100';
    this.apiKey = process.env.DEFAULT_MERCHANT_API_KEY || 'pmt_live_sec_99a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4';
    this.webhookSecret = process.env.DEFAULT_MERCHANT_WEBHOOK_SECRET || 'pmt_whsec_77b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2';

    this.sdk = new PmtMerchantClient({
      apiKey: this.apiKey,
      webhookSecret: this.webhookSecret,
      baseUrl: this.apiBaseUrl
    });

    this.storeTemplate = fs.readFileSync(path.join(viewsDir, 'store.html'), 'utf8');
  }

  createServer() {
    return http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;

      // Health
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'HEALTHY', service: 'demo-store' }));
        return;
      }

      // Serve Storefront UI
      if (pathname === '/' || pathname === '/store') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.storeTemplate);
        return;
      }

      // Create Order Proxy Endpoint
      if (pathname === '/api/create-order' && req.method === 'POST') {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', async () => {
          try {
            const { amount, orderId } = JSON.parse(body || '{}');
            const payment = await this.sdk.createPayment({
              amount,
              orderId,
              customerMobile: '9876543210',
              customerName: 'Demo Shopper'
            });

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(payment.payment));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }

      // Webhook Ingestion Endpoint
      if (pathname === '/api/webhook' && req.method === 'POST') {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          const signature = req.headers['x-pmt-signature'] || '';
          const timestamp = req.headers['x-pmt-timestamp'] || '';

          const isValid = this.sdk.verifyWebhook(body, signature, timestamp);
          if (!isValid) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid HMAC signature' }));
            return;
          }

          console.log('[Demo Store] Webhook verified successfully:', JSON.parse(body));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true }));
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
  }
}
