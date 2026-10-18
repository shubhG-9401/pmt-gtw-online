import test from 'node:test';
import assert from 'node:assert/strict';
import { Database, MerchantRepository, PaymentRepository } from '@pmt/db';
import { QueueEngine } from '../index.js';

test('Queue Engine FIFO Concurrency suite', async (t) => {
  const db = new Database({ inMemory: true });
  const merchantRepo = new MerchantRepository(db);
  const paymentRepo = new PaymentRepository(db);
  const queueEngine = new QueueEngine(db);

  const merchant = merchantRepo.getDefaultMerchant();
  const vpa = merchant.vpa;

  const p1 = paymentRepo.create({ merchantId: merchant.id, amount: 100 });
  const p2 = paymentRepo.create({ merchantId: merchant.id, amount: 200 });

  await t.test('First buyer instantly acquires ACTIVE queue slot', () => {
    const res1 = queueEngine.enqueue(vpa, p1.id, 300);
    assert.equal(res1.status, 'ACTIVE');
    assert.equal(res1.position, 0);

    const payment1 = paymentRepo.findById(p1.id);
    assert.equal(payment1.status, 'ACTIVE');
  });

  await t.test('Second concurrent buyer enters FIFO queue as WAITING at position 1', () => {
    const res2 = queueEngine.enqueue(vpa, p2.id, 300);
    assert.equal(res2.status, 'WAITING');
    assert.equal(res2.position, 1);

    const payment2 = paymentRepo.findById(p2.id);
    assert.equal(payment2.status, 'QUEUED');
  });

  await t.test('Releasing first slot promotes second buyer to ACTIVE position 0', () => {
    const promo = queueEngine.releaseSlot(vpa, p1.id, 300);
    assert.ok(promo);
    assert.equal(promo.promotedPaymentId, p2.id);

    const status2 = queueEngine.getStatus(p2.id);
    assert.equal(status2.status, 'ACTIVE');
    assert.equal(status2.position, 0);

    const payment2 = paymentRepo.findById(p2.id);
    assert.equal(payment2.status, 'ACTIVE');
  });

  db.close();
});
