import { signHmac, verifyHmac } from '@pmt/common';

export class PmtMerchantClient {
  /**
   * @param {object} options
   * @param {string} options.apiKey
   * @param {string} [options.webhookSecret]
   * @param {string} [options.baseUrl='http://localhost:6100']
   */
  constructor({ apiKey, webhookSecret = '', baseUrl = 'http://localhost:6100' }) {
    if (!apiKey) throw new Error('PMT API Key is required');
    this.apiKey = apiKey;
    this.webhookSecret = webhookSecret;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Create a new payment session / order.
   * @param {object} params
   * @param {number} params.amount - Amount in INR
   * @param {string} [params.orderId] - Merchant Order Reference
   * @param {string} [params.customerMobile]
   * @param {string} [params.customerName]
   * @param {string} [params.mode='ONLINE']
   * @returns {Promise<object>}
   */
  async createPayment({ amount, orderId = null, customerMobile = null, customerName = null, mode = 'ONLINE' }) {
    const res = await fetch(`${this.baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ amount, orderId, customerMobile, customerName, mode })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `Payment creation failed with HTTP ${res.status}`);
    }

    return data;
  }

  /**
   * Retrieve payment session status.
   * @param {string} paymentId
   * @returns {Promise<object>}
   */
  async getPayment(paymentId) {
    const res = await fetch(`${this.baseUrl}/api/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `Payment query failed with HTTP ${res.status}`);
    }
    return data;
  }

  /**
   * Verifies an incoming webhook signature from PMT GTW.
   * @param {string|object} rawBody - Raw request body
   * @param {string} signature - Value of X-PMT-Signature header
   * @param {string} timestamp - Value of X-PMT-Timestamp header
   * @returns {boolean}
   */
  verifyWebhook(rawBody, signature, timestamp) {
    if (!this.webhookSecret) {
      throw new Error('Webhook secret is required to verify signatures');
    }
    const payload = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    return verifyHmac(`${timestamp}.${payload}`, signature, this.webhookSecret);
  }
}
