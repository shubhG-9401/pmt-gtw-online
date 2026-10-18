import test from 'node:test';
import assert from 'node:assert/strict';
import { Database, MerchantRepository, PaymentRepository, ObserverRepository, WebhookRepository } from '@pmt/db';
import { AttributionEngine } from '../index.js';

test('Attribution Engine test suite', async (t) => {
  const db = new Database({ inMemory: true });
  const merchantRepo = new MerchantRepository(db);
  const paymentRepo = new PaymentRepository(db);
  const observerRepo = new ObserverRepository(db);
  const webhookRepo = new WebhookRepository(db);

  const engine = new AttributionEngine({
    paymentRepo,
    observerRepo,
    webhookRepo,
    merchantRepo
  });

  const merchant = merchantRepo.getDefaultMerchant();
  const payment = paymentRepo.create({
    merchantId: merchant.id,
    amount: 999.00,
    orderId: 'ORD_ATTR_TEST'
  });

  await t.test('Matches pending payment by exact amount and updates status to SUCCESS', async () => {
    const res = await engine.processCreditEvent({
      observerType: 'ANDROID_SMS',
      rawPayload: 'Your account credited with INR 999.00, UTR 999888777666',
      amount: 999.00,
      utr: '999888777666',
      sender: 'HDFCBK',
      payerVpa: 'payer@okhdfcbank'
    });

    assert.equal(res.matched, true);
    assert.equal(res.payment.id, payment.id);
    assert.equal(res.payment.status, 'SUCCESS');
    assert.equal(res.payment.utr, '999888777666');

    // Webhook was enqueued
    const pendingWebhooks = webhookRepo.getPending();
    assert.ok(pendingWebhooks.length > 0);
  });

  await t.test('Prevents duplicate payment credit on replayed UTR', async () => {
    const replayRes = await engine.processCreditEvent({
      observerType: 'GMAIL',
      rawPayload: 'Duplicate email with UTR 999888777666',
      amount: 999.00,
      utr: '999888777666'
    });

    assert.equal(replayRes.matched, false);
    assert.equal(replayRes.reason, 'DUPLICATE_UTR');
  });

  db.close();
});
