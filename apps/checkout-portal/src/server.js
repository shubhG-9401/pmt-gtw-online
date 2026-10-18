import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase, MerchantRepository, PaymentRepository } from '@pmt/db';
import { generateQrSvg } from '@pmt/core';
import { buildIntentUrls } from '@pmt/common';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsDir = path.join(__dirname, 'views');
const publicDir = path.resolve(__dirname, '../public');
const sdkPath = path.resolve(__dirname, '../../../packages/merchant-sdk/src/pmt.js');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

export class CheckoutServer {
  /**
   * @param {object} [options={}]
   * @param {import('@pmt/db').Database} [options.db]
   * @param {string} [options.apiBaseUrl]
   */
  constructor(options = {}) {
    this.db = options.db || getDatabase();
    this.paymentRepo = new PaymentRepository(this.db);
    this.merchantRepo = new MerchantRepository(this.db);
    this.apiBaseUrl = options.apiBaseUrl || process.env.BASE_PAYMENT_API_URL || 'http://localhost:6100';
    this.checkoutTemplate = fs.readFileSync(path.join(viewsDir, 'checkout.html'), 'utf8');
  }

  createServer() {
    return http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;

      // Health
      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'HEALTHY', service: 'checkout-portal' }));
        return;
      }

      // Serve Universal Embed Script /pmt.js
      if (pathname === '/pmt.js') {
        try {
          const content = fs.readFileSync(sdkPath, 'utf8');
          res.writeHead(200, {
            'Content-Type': 'application/javascript',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600'
          });
          res.end(content);
          return;
        } catch {
          // fallback if path differs
          res.writeHead(404);
          res.end('/* pmt.js not found */');
          return;
        }
      }

      // Serve Static Icons from /icons/*
      if (pathname.startsWith('/icons/')) {
        const filePath = path.join(publicDir, pathname);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath);
          const mime = MIME_TYPES[ext] || 'application/octet-stream';
          res.writeHead(200, {
            'Content-Type': mime,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400'
          });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }

      // Serve /checkout/:id
      const checkoutMatch = /^\/checkout\/([a-zA-Z0-9_\-]+)$/.exec(pathname);
      if (checkoutMatch) {
        const paymentId = checkoutMatch[1];
        const payment = this.paymentRepo.findById(paymentId);
        if (!payment) {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end('<h1>404 Payment Not Found</h1>');
          return;
        }

        const merchant = this.merchantRepo.findById(payment.merchant_id) || {
          name: 'PMT Digital Store',
          vpa: 'merchant@okhdfcbank'
        };

        const upiUri = payment.upi_uri || `upi://pay?pa=${merchant.vpa}&pn=${encodeURIComponent(merchant.name)}&am=${payment.amount.toFixed(2)}&cu=INR&tr=${payment.id}`;
        const qrSvg = generateQrSvg(upiUri, 220);
        const intents = buildIntentUrls(upiUri);
        const redirectUrl = url.searchParams.get('redirect_url') || '';

        let html = this.checkoutTemplate;
        html = html.replaceAll('{{BRAND_NAME}}', merchant.name);
        html = html.replaceAll('{{MERCHANT_NAME}}', merchant.name);
        html = html.replaceAll('{{MERCHANT_INITIAL}}', merchant.name.charAt(0).toUpperCase());
        html = html.replaceAll('{{ORDER_ID}}', payment.order_id || payment.id.slice(0, 8));
        html = html.replaceAll('{{AMOUNT}}', Number(payment.amount).toFixed(2));
        html = html.replaceAll('{{{QR_SVG}}}', qrSvg);
        html = html.replaceAll('{{VPA}}', merchant.vpa);
        html = html.replaceAll('{{PAYMENT_ID}}', payment.id);
        html = html.replaceAll('{{API_BASE_URL}}', this.apiBaseUrl);
        html = html.replaceAll('{{REDIRECT_URL}}', redirectUrl);
        html = html.replaceAll('{{INTENT_GPAY}}', intents.gpay);
        html = html.replaceAll('{{INTENT_PHONEPE}}', intents.phonepe);
        html = html.replaceAll('{{INTENT_PAYTM}}', intents.paytm);
        html = html.replaceAll('{{INTENT_CRED}}', intents.cred);

        res.writeHead(200, {
          'Content-Type': 'text/html',
          'X-Frame-Options': 'ALLOWALL',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(html);
        return;
      }

      // Root redirect to demo store
      if (pathname === '/') {
        res.writeHead(302, { 'Location': 'http://localhost:5000' });
        res.end();
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
  }
}
