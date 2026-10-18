export class TimingEngine {
  /**
   * @param {object} dependencies
   * @param {import('@pmt/db').Database} dependencies.db
   * @param {import('./queue-engine.js').QueueEngine} dependencies.queueEngine
   */
  constructor({ db, queueEngine }) {
    this.db = db;
    this.queueEngine = queueEngine;
  }

  /**
   * Sweeps expired payments and releases their queue locks.
   * @returns {number} Count of expired payments handled
   */
  sweepExpiredPayments() {
    return this.db.transaction(() => {
      // Find payments past their expires_at that are not in a terminal state
      const expiredList = this.db.query(
        `SELECT id, merchant_id, status FROM payments 
         WHERE status IN ('CREATED', 'ACTIVE', 'PAYING') 
           AND datetime('now') > expires_at`
      );

      for (const p of expiredList) {
        this.db.execute("UPDATE payments SET status = 'EXPIRED', updated_at = datetime('now') WHERE id = ?", [p.id]);

        // Release queue slot if any
        const queueSlot = this.db.queryOne('SELECT vpa FROM payment_queue WHERE payment_id = ?', [p.id]);
        if (queueSlot) {
          this.queueEngine.releaseSlot(queueSlot.vpa, p.id);
        }
      }

      return expiredList.length;
    });
  }
}
