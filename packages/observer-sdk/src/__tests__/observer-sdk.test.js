import test from 'node:test';
import assert from 'node:assert/strict';
import { PmtObserverClient } from '../index.js';

test('Observer SDK test suite', () => {
  const obs = new PmtObserverClient({
    deviceId: 'android_device_01',
    hmacSecret: 'secret_123',
    baseUrl: 'http://localhost:6100'
  });

  assert.equal(obs.deviceId, 'android_device_01');
  assert.equal(obs.hmacSecret, 'secret_123');
  assert.equal(obs.baseUrl, 'http://localhost:6100');
});
