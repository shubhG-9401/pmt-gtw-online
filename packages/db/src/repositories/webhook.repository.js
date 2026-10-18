import { generateId } from '@pmt/common';

export class WebhookRepository {
  /**
   * @param {import('../database.js').Database} db
   */
  constructor(db) {
    this.db = db;
  }

  enqueue({ paymentId, merchantId, event, payload }) {
    const id = generateId('wh');
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

    this.db.execute(
      `INSERT INTO webhooks (id, payment_id, merchant_id, event, payload, status, next_retry_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', datetime('now'))`,
      [id, paymentId, merchantId, event, payloadStr]
    );

    return this.db.queryOne('SELECT * FROM webhooks WHERE id = ?', [id]);
  }

  getPending(limit = 20) {
    return this.db.query(
      `SELECT * FROM webhooks
       WHERE status = 'PENDING' AND datetime('now') >= next_retry_at
       ORDER BY created_at ASC LIMIT ?`,
      [limit]
    );
  }

  recordSuccess(id, responseCode) {
    this.db.execute(
      `UPDATE webhooks SET status = 'SENT', last_response_code = ?, attempts = attempts + 1 WHERE id = ?`,
      [responseCode, id]
    );
  }

  recordFailure(id, responseCode, nextRetryMinutes = null) {
    if (nextRetryMinutes !== null) {
      this.db.execute(
        `UPDATE webhooks 
         SET status = 'PENDING', 
             last_response_code = ?, 
             attempts = attempts + 1,
             next_retry_at = datetime('now', '+' || ? || ' minutes')
         WHERE id = ?`,
        [responseCode, nextRetryMinutes, id]
      );
    } else {
      this.db.execute(
        `UPDATE webhooks SET status = 'FAILED', last_response_code = ?, attempts = attempts + 1 WHERE id = ?`,
        [responseCode, id]
      );
    }
  }

  list(limit = 50) {
    return this.db.query('SELECT * FROM webhooks ORDER BY created_at DESC LIMIT ?', [limit]);
  }
}
