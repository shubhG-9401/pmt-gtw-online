import crypto from 'node:crypto';

/**
 * Generate a random cryptographically secure ID with a given prefix.
 * @param {string} prefix
 * @returns {string}
 */
export function generateId(prefix = '') {
  const uuid = crypto.randomUUID();
  return prefix ? `${prefix}_${uuid.replace(/-/g, '').slice(0, 16)}` : uuid;
}

/**
 * Generate a random secret string (hex or base64url).
 * @param {number} bytes
 * @returns {string}
 */
export function generateSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Timing-safe string comparison to protect against timing analysis attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generate an HMAC-SHA256 signature for a payload.
 * @param {string|object} payload
 * @param {string} secret
 * @returns {string} Hex signature
 */
export function signHmac(payload, secret) {
  if (!secret) throw new Error('HMAC secret is required');
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

/**
 * Verify an HMAC-SHA256 signature against expected payload in constant time.
 * @param {string|object} payload
 * @param {string} signature
 * @param {string} secret
 * @returns {boolean}
 */
export function verifyHmac(payload, signature, secret) {
  if (!signature || !secret) return false;
  const expected = signHmac(payload, secret);
  return safeEqual(expected, signature);
}

/**
 * Get default admin bearer token from environment.
 * @returns {string}
 */
export function getAdminToken() {
  return process.env.ADMIN_BEARER_TOKEN || 'pmt_admin_master_secret_2026_xyz';
}
