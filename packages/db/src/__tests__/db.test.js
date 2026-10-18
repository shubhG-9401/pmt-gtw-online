import test from 'node:test';
import assert from 'node:assert/strict';
import { Database, MerchantRepository, PaymentRepository, CustomerRepository, ObserverRepository, WebhookRepository } from '../index.js';

test('Database and Repositories test suite', async (t) => {
  const db = new Database({ inMemory: true });
  const merchantRepo = new MerchantRepository(db);
  const paymentRepo = new PaymentRepository(db);
  const customerRepo = new CustomerRepository(db);
  const observerRepo = new ObserverRepository(db);
  const webhookRepo = new WebhookRepository(db);

  await t.test('Database boots and runs migrations cleanly', () => {
    const defaultMerchant = merchantRepo.getDefaultMerchant();
    assert.ok(defaultMerchant);
    assert.equal(defaultMerchant.name, 'PMT Digital Store');
    assert.ok(defaultMerchant.api_key);
  });

  let createdPayment = null;

  await t.test('PaymentRepository creates and retrieves orders', () => {
    const merchant = merchantRepo.getDefaultMerchant();
    createdPayment = paymentRepo.create({
      merchantId: merchant.id,
      amount: 750.50,
      orderId: 'ORD_TEST_01',
      customerMobile: '9876543210',
      customerName: 'Test Customer'
    });

    assert.ok(createdPayment);
    assert.ok(createdPayment.id.startsWith('pmt_'));
    assert.equal(createdPayment.amount, 750.50);
    assert.equal(createdPayment.status, 'CREATED');

    const found = paymentRepo.findById(createdPayment.id);
    assert.equal(found.id, createdPayment.id);
    assert.equal(found.order_id, 'ORD_TEST_01');
  });

  await t.test('PaymentRepository transitions payment to SUCCESS', () => {
    const updated = paymentRepo.markSuccess(createdPayment.id, {
      utr: '123456789012',
      payerVpa: 'payer@okhdfcbank',
      observationChannel: 'OBSERVER_SMS'
    });

    assert.equal(updated.status, 'SUCCESS');
    assert.equal(updated.utr, '123456789012');
    assert.equal(updated.payer_vpa, 'payer@okhdfcbank');

    const metrics = paymentRepo.getMetrics();
    assert.equal(metrics.totalTransactions, 1);
    assert.equal(metrics.successCount, 1);
    assert.equal(metrics.totalVolume, 750.50);
  });

  await t.test('CustomerRepository manages OTP lifecycle', () => {
    const otp = customerRepo.saveOtp('9998887776', '123456');
    assert.ok(otp.id);

    const failVerify = customerRepo.verifyOtp('9998887776', '000000');
    assert.equal(failVerify.valid, false);

    const successVerify = customerRepo.verifyOtp('9998887776', '123456');
    assert.equal(successVerify.valid, true);
  });

  await t.test('ObserverRepository records bank observation events', () => {
    const ev = observerRepo.recordEvent({
      observerType: 'ANDROID_SMS',
      rawPayload: 'Your a/c credited with INR 750.50 on 19-10-2026. Ref UTR: 123456789012',
      parsedAmount: 750.50,
      parsedUtr: '123456789012',
      parsedSender: 'HDFCBK',
      matchedPaymentId: createdPayment.id,
      status: 'MATCHED'
    });

    assert.ok(ev);
    assert.equal(ev.parsed_amount, 750.50);
    assert.equal(ev.parsed_utr, '123456789012');
    assert.equal(ev.status, 'MATCHED');
  });

  await t.test('WebhookRepository enqueues and tracks deliveries', () => {
    const merchant = merchantRepo.getDefaultMerchant();
    const wh = webhookRepo.enqueue({
      paymentId: createdPayment.id,
      merchantId: merchant.id,
      event: 'payment.success',
      payload: { paymentId: createdPayment.id, amount: 750.50, status: 'SUCCESS' }
    });

    assert.ok(wh);
    assert.equal(wh.status, 'PENDING');

    const pending = webhookRepo.getPending();
    assert.ok(pending.length > 0);

    webhookRepo.recordSuccess(wh.id, 200);
    const updated = db.queryOne('SELECT * FROM webhooks WHERE id = ?', [wh.id]);
    assert.equal(updated.status, 'SENT');
    assert.equal(updated.last_response_code, 200);
  });

  db.close();
});
