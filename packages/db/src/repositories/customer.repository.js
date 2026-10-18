import { generateId } from '@pmt/common';

export class CustomerRepository {
  /**
   * @param {import('../database.js').Database} db
   */
  constructor(db) {
    this.db = db;
  }

  findByMobile(mobileNumber) {
    return this.db.queryOne('SELECT * FROM customers WHERE mobile_number = ?', [mobileNumber.trim()]);
  }

  createOrUpdate({ mobileNumber, name = null, email = null }) {
    const existing = this.findByMobile(mobileNumber);
    if (existing) {
      this.db.execute(
        `UPDATE customers SET name = coalesce(?, name), email = coalesce(?, email), updated_at = datetime('now') WHERE id = ?`,
        [name, email, existing.id]
      );
      return this.findByMobile(mobileNumber);
    }

    const id = generateId('cust');
    this.db.execute(
      `INSERT INTO customers (id, mobile_number, name, email) VALUES (?, ?, ?, ?)`,
      [id, mobileNumber.trim(), name, email]
    );
    return this.findByMobile(mobileNumber);
  }

  saveOtp(mobileNumber, otpCode, expiryMinutes = 5) {
    const id = generateId('otp');
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
    this.db.execute(
      `INSERT INTO customer_otps (id, mobile_number, otp_code, expires_at) VALUES (?, ?, ?, ?)`,
      [id, mobileNumber.trim(), otpCode.trim(), expiresAt]
    );
    return { id, mobileNumber, expiresAt };
  }

  verifyOtp(mobileNumber, otpCode) {
    const row = this.db.queryOne(
      `SELECT * FROM customer_otps 
       WHERE mobile_number = ? AND verified = 0 AND datetime('now') < expires_at
       ORDER BY created_at DESC LIMIT 1`,
      [mobileNumber.trim()]
    );

    if (!row) {
      return { valid: false, reason: 'OTP_EXPIRED_OR_NOT_FOUND' };
    }

    if (row.otp_code !== otpCode.trim()) {
      this.db.execute('UPDATE customer_otps SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      return { valid: false, reason: 'INVALID_OTP' };
    }

    this.db.execute('UPDATE customer_otps SET verified = 1 WHERE id = ?', [row.id]);
    return { valid: true };
  }
}
