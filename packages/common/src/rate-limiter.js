/**
 * In-memory Sliding Window Rate Limiter.
 * Protects endpoints like OTP dispatch, order creation, and observer ingest.
 */
export class RateLimiter {
  /**
   * @param {object} options
   * @param {number} [options.windowMs=60000] - Window size in milliseconds
   * @param {number} [options.max=5] - Maximum requests allowed per window
   */
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000;
    this.max = options.max || 5;
    this.hits = new Map();
  }

  /**
   * Check and consume one token for a key.
   * In test mode or when disabled, always allows.
   * @param {string} key
   * @returns {{ allowed: boolean, remaining: number, resetMs: number }}
   */
  consume(key) {
    if (process.env.NODE_ENV === 'test' && !process.env.TEST_RATE_LIMIT) {
      return { allowed: true, remaining: this.max, resetMs: 0 };
    }

    const now = Date.now();
    let timestamps = this.hits.get(key) || [];

    // Filter out expired timestamps outside current sliding window
    timestamps = timestamps.filter(ts => now - ts < this.windowMs);

    if (timestamps.length >= this.max) {
      const oldest = timestamps[0];
      const resetMs = Math.max(0, this.windowMs - (now - oldest));
      return { allowed: false, remaining: 0, resetMs };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);

    return {
      allowed: true,
      remaining: this.max - timestamps.length,
      resetMs: this.windowMs
    };
  }

  /**
   * Reset rate limit bucket for a key.
   * @param {string} key
   */
  reset(key) {
    this.hits.delete(key);
  }

  /**
   * Clear all records.
   */
  clear() {
    this.hits.clear();
  }
}
