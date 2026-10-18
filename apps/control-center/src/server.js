import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsDir = path.join(__dirname, 'views');

export class ControlCenterServer {
  constructor() {
    this.template = fs.readFileSync(path.join(viewsDir, 'dashboard.html'), 'utf8');
  }

  createServer() {
    return http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'HEALTHY', service: 'control-center' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(this.template);
    });
  }
}
