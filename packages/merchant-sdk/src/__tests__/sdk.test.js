import test from 'node:test';
import assert from 'node:assert/strict';
import { PmtMerchantClient } from '../index.js';
import { signHmac } from '@pmt/common';

test('Merchant SDK test suite', async (t) => {
  const client = new PmtMerchantClient({
    apiKey: 'pmt_live_sec_test',
    webhookSecret: 'whsec_secret_123',
    baseUrl: 'http://localhost:6100'
  });

  await t.test('Initializes with required configurations', () => {
    assert.equal(client.apiKey, 'pmt_live_sec_test');
    assert.equal(client.baseUrl, 'http://localhost:6100');
  });

  await t.test('Validates incoming webhook signature in constant time', () => {
    const rawPayload = JSON.stringify({ event: 'payment.success', amount: 500 });
    const timestamp = Date.now().toString();
    const signature = signHmac(`${timestamp}.${rawPayload}`, 'whsec_secret_123');

    const isValid = client.verifyWebhook(rawPayload, signature, timestamp);
    assert.equal(isValid, true);

    const isInvalid = client.verifyWebhook(rawPayload, 'wrong_signature', timestamp);
    assert.equal(isInvalid, false);
  });
});
