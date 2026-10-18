import test from 'node:test';
import assert from 'node:assert/strict';
import { Database, MerchantRepository, PaymentRepository } from '@pmt/db';
import { CheckoutServer } from '../server.js';

test('Checkout Portal Integration Suite', async (t) => {
  const db = new Database({ inMemory: true });
  const merchantRepo = new MerchantRepository(db);
  const paymentRepo = new PaymentRepository(db);

  const merchant = merchantRepo.getDefaultMerchant();
  const payment = paymentRepo.create({
    merchantId: merchant.id,
    amount: 550.00,
    orderId: 'TEST_CHK_01'
  });

  const portal = new CheckoutServer({ db, apiBaseUrl: 'http://localhost:6100' });
  const rawServer = portal.createServer();

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
    db.close();
  });

  await t.test('GET /health returns 200 HEALTHY', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'HEALTHY');
  });

  await t.test('GET /checkout/:id renders checkout HTML with vector QR', async () => {
    const res = await fetch(`${baseUrl}/checkout/${payment.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html');
    const html = await res.text();
    assert.ok(html.includes('550.00'));
    assert.ok(html.includes('<svg'));
    assert.ok(html.includes(payment.id));
  });

  await t.test('GET /pmt.js serves drop-in client SDK', async () => {
    const res = await fetch(`${baseUrl}/pmt.js`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('javascript'));
    const js = await res.text();
    assert.ok(js.includes('PmtGateway'));
  });
});
