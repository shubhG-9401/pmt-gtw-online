import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoStoreServer } from '../server.js';
import { signHmac } from '@pmt/common';

test('Demo Store Integration Suite', async (t) => {
  const store = new DemoStoreServer({ apiBaseUrl: 'http://localhost:6100' });
  const rawServer = store.createServer();

  let serverInstance;
  let baseUrl;

  await new Promise((resolve) => {
    serverInstance = rawServer.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${serverInstance.address().port}`;
      resolve();
    });
  });

  t.after(() => {
    serverInstance.close();
  });

  await t.test('GET /health returns 200 HEALTHY', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'HEALTHY');
  });

  await t.test('GET / renders Storefront HTML', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html');
    const html = await res.text();
    assert.ok(html.includes('PMT Cloud Store'));
    assert.ok(html.includes('1-Click UPI Pay'));
  });

  await t.test('POST /api/webhook validates signature and accepts webhook', async () => {
    const payload = JSON.stringify({ event: 'payment.success', amount: 499 });
    const timestamp = Date.now().toString();
    const signature = signHmac(`${timestamp}.${payload}`, store.webhookSecret);

    const res = await fetch(`${baseUrl}/api/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PMT-Signature': signature,
        'X-PMT-Timestamp': timestamp
      },
      body: payload
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.received, true);
  });
});
