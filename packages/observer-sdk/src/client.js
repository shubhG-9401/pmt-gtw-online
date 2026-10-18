import { signHmac } from '@pmt/common';

export class PmtObserverClient {
  /**
   * @param {object} options
   * @param {string} options.deviceId
   * @param {string} options.hmacSecret
   * @param {string} [options.baseUrl='http://localhost:6100']
   */
  constructor({ deviceId, hmacSecret, baseUrl = 'http://localhost:6100' }) {
    if (!deviceId) throw new Error('Device ID is required');
    if (!hmacSecret) throw new Error('HMAC secret is required');
    this.deviceId = deviceId;
    this.hmacSecret = hmacSecret;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Submit an observed banking credit event.
   * @param {object} event
   * @param {string} event.observerType - e.g. 'ANDROID_SMS', 'GMAIL', 'WEB_SMS'
   * @param {number} event.amount
   * @param {string} event.utr - 12-digit UTR
   * @param {string} [event.sender]
   * @param {string} [event.payerVpa]
   * @param {string|object} [event.rawPayload]
   * @returns {Promise<object>}
   */
  async submitCreditEvent(event) {
    const payloadStr = JSON.stringify(event);
    const timestamp = Date.now().toString();
    const signature = signHmac(`${timestamp}.${payloadStr}`, this.hmacSecret);

    const res = await fetch(`${this.baseUrl}/api/v1/observer/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': this.deviceId,
        'X-Timestamp': timestamp,
        'X-Signature': signature
      },
      body: payloadStr
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `Observer event submission failed with HTTP ${res.status}`);
    }

    return data;
  }

  /**
   * Send heartbeat to keep device active in monitoring dashboard.
   */
  async sendHeartbeat() {
    const timestamp = Date.now().toString();
    const signature = signHmac(`${timestamp}.heartbeat`, this.hmacSecret);

    const res = await fetch(`${this.baseUrl}/api/v1/observer/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': this.deviceId,
        'X-Timestamp': timestamp,
        'X-Signature': signature
      },
      body: JSON.stringify({ timestamp })
    });

    return res.ok;
  }
}
