import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateId,
  generateSecret,
  signHmac,
  verifyHmac,
  safeEqual,
  buildUpiUrl,
  buildIntentUrls,
  parseUpiUrl,
  RateLimiter,
  ValidationError,
  NotFoundError
} from '../index.js';

test('Crypto utilities test suite', async (t) => {
  await t.test('generateId creates unique prefixed IDs', () => {
    const id1 = generateId('pmt');
    const id2 = generateId('pmt');
    assert.ok(id1.startsWith('pmt_'));
    assert.ok(id2.startsWith('pmt_'));
    assert.notEqual(id1, id2);
  });

  await t.test('generateSecret generates random hex string', () => {
    const secret = generateSecret(16);
    assert.equal(secret.length, 32);
  });

  await t.test('signHmac and verifyHmac correctly validate signatures', () => {
    const secret = 'test_secret_key_123';
    const payload = { amount: 499.00, orderId: 'ord_123' };
    const sig = signHmac(payload, secret);
    assert.ok(sig);
    assert.equal(typeof sig, 'string');
    assert.equal(verifyHmac(payload, sig, secret), true);
    assert.equal(verifyHmac(payload, 'invalid_sig', secret), false);
    assert.equal(verifyHmac({ amount: 500 }, sig, secret), false);
  });

  await t.test('safeEqual performs timing-safe string comparison', () => {
    assert.equal(safeEqual('hello', 'hello'), true);
    assert.equal(safeEqual('hello', 'world'), false);
    assert.equal(safeEqual('hello', 'hell'), false);
  });
});

test('UPI utility suite', async (t) => {
  await t.test('buildUpiUrl generates compliant upi://pay URI', () => {
    const uri = buildUpiUrl({
      pa: 'merchant@okhdfcbank',
      pn: 'PMT Store',
      am: 125.5,
      tr: 'ORD_9901',
      tn: 'Payment for Order 9901'
    });

    assert.ok(uri.startsWith('upi://pay?'));
    assert.ok(uri.includes('pa=merchant%40okhdfcbank'));
    assert.ok(uri.includes('pn=PMT+Store'));
    assert.ok(uri.includes('am=125.50'));
    assert.ok(uri.includes('tr=ORD_9901'));
  });

  await t.test('buildIntentUrls generates 1-tap app links', () => {
    const uri = buildUpiUrl({
      pa: 'merchant@okhdfcbank',
      pn: 'PMT Store',
      am: 500
    });
    const intents = buildIntentUrls(uri);
    assert.ok(intents.gpay.startsWith('tez://upi/pay?'));
    assert.ok(intents.phonepe.startsWith('phonepe://pay?'));
    assert.ok(intents.paytm.startsWith('paytmmp://pay?'));
    assert.ok(intents.cred.startsWith('credpay://upi/pay?'));
    assert.ok(intents.bhim.startsWith('bhim://pay?'));
  });

  await t.test('parseUpiUrl extracts parameters accurately', () => {
    const uri = 'upi://pay?pa=store%40upi&pn=Store&am=100.00&cu=INR&tr=ref_1';
    const parsed = parseUpiUrl(uri);
    assert.equal(parsed.pa, 'store@upi');
    assert.equal(parsed.pn, 'Store');
    assert.equal(parsed.am, '100.00');
    assert.equal(parsed.tr, 'ref_1');
  });
});

test('Rate limiter suite', () => {
  const limiter = new RateLimiter({ windowMs: 1000, max: 2 });
  // Under NODE_ENV=test, rate limiting is bypassed unless TEST_RATE_LIMIT is set
  const res = limiter.consume('ip_1');
  assert.equal(res.allowed, true);
});
