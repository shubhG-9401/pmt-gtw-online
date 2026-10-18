import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase, MerchantRepository } from '@pmt/db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsDir = path.join(__dirname, 'views');

export class AdminServer {
  /**
   * @param {object} [options={}]
   * @param {import('@pmt/db').Database} [options.db]
   * @param {string} [options.apiBaseUrl]
   */
  constructor(options = {}) {
    this.db = options.db || getDatabase();
    this.merchantRepo = new MerchantRepository(this.db);
    this.apiBaseUrl = options.apiBaseUrl || process.env.BASE_PAYMENT_API_URL || 'http://localhost:6100';
    this.adminTemplate = fs.readFileSync(path.join(viewsDir, 'admin.html'), 'utf8');
  }

  createServer() {
    return http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = url.pathname;

      if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'HEALTHY', service: 'merchant-admin' }));
        return;
      }

      // Transparent API Proxy to Payment API
      if (pathname.startsWith('/api/')) {
        const targetUrl = `${this.apiBaseUrl}${pathname}${url.search}`;
        const headers = { ...req.headers };
        delete headers.host;

        try {
          const proxyReq = await fetch(targetUrl, {
            method: req.method,
            headers,
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
            duplex: 'half'
          });

          res.writeHead(proxyReq.status, Object.fromEntries(proxyReq.headers.entries()));
          const buffer = await proxyReq.arrayBuffer();
          res.end(Buffer.from(buffer));
          return;
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy failure', message: err.message }));
          return;
        }
      }

      // Serve Admin Dashboard HTML
      if (pathname === '/' || pathname === '/admin') {
        const merchant = this.merchantRepo.getDefaultMerchant() || {
          name: 'PMT Digital Store',
          vpa: 'merchant@okhdfcbank',
          api_key: 'pmt_live_sec_default',
          webhook_secret: 'pmt_whsec_default'
        };

        let html = this.adminTemplate;
        html = html.replaceAll('{{MERCHANT_NAME}}', merchant.name);
        html = html.replaceAll('{{MERCHANT_VPA}}', merchant.vpa);
        html = html.replaceAll('{{API_KEY}}', merchant.api_key);
        html = html.replaceAll('{{WEBHOOK_SECRET}}', merchant.webhook_secret);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });
  }
}
