import test from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '@pmt/db';
import { PaymentApiServer } from '../server.js';

test('Payment API Integration Suite', async (t) => {
  const db = new Database({ inMemory: true });
  const apiServer = new PaymentApiServer({ db });
  const rawServer = apiServer.createServer();

  let serverInstance;
  let baseUrl;

  await new Promise((resolve) => {
    serverInstance = rawServer.listen(0, '127.0.0.1', () => {
      const port = serverInstance.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  t.after(() => {
    serverInstance.close();
    db.close();
  });

  await t.test('GET /api/v1/health returns 200 HEALTHY', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'HEALTHY');
  });

  let createdPayment = null;

  await t.test('POST /api/v1/payments creates payment session and returns UPI URI', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 350.00,
        orderId: 'ORD_TEST_99',
        customerMobile: '9876543210'
      })
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.payment.id);
    assert.equal(data.payment.amount, 350.00);
    assert.ok(data.payment.upiUrl.startsWith('upi://pay?'));
    assert.ok(data.payment.intents.gpay);
    assert.ok(data.payment.intents.phonepe);
    createdPayment = data.payment;
  });

  await t.test('GET /api/v1/payments/:id returns payment status', async () => {
    const res = await fetch(`${baseUrl}/api/v1/payments/${createdPayment.id}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.payment.id, createdPayment.id);
    assert.equal(data.payment.status, 'ACTIVE');
  });

  let generatedOtp = null;

  await t.test('POST /api/v1/customer/send-otp dispatches OTP', async () => {
    const res = await fetch(`${baseUrl}/api/v1/customer/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobileNumber: '9876543210' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.devOtp);
    generatedOtp = data.devOtp;
  });

  await t.test('POST /api/v1/customer/verify-otp validates OTP and returns token', async () => {
    const res = await fetch(`${baseUrl}/api/v1/customer/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobileNumber: '9876543210',
        otp: generatedOtp
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.token);
  });

  await t.test('POST /api/v1/admin/simulate-credit marks payment as SUCCESS', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/simulate-credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentId: createdPayment.id,
        amount: 350.00,
        utr: '987654321999'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.matched, true);
    assert.equal(data.payment.status, 'SUCCESS');
    assert.equal(data.payment.utr, '987654321999');
  });

  await t.test('GET /api/v1/admin/metrics returns live stats', async () => {
    const res = await fetch(`${baseUrl}/api/v1/admin/metrics`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.metrics.successCount, 1);
    assert.equal(data.metrics.totalVolume, 350.00);
  });
});
