import { generateId } from '@pmt/common';

export class QueueEngine {
  /**
   * @param {import('@pmt/db').Database} db
   */
  constructor(db) {
    this.db = db;
  }

  /**
   * Enqueue a payment for VPA queue arbitration.
   * If slot is free, immediately acquires slot (ACTIVE).
   * Otherwise waits in FIFO order (WAITING).
   * @param {string} vpa - Payee VPA
   * @param {string} paymentId - Payment Session ID
   * @param {number} [lockSeconds=300]
   * @returns {{ status: 'ACTIVE'|'WAITING', position: number }}
   */
  enqueue(vpa, paymentId, lockSeconds = 300) {
    return this.db.transaction(() => {
      // Check if this payment is already queued
      const existing = this.db.queryOne(
        'SELECT * FROM payment_queue WHERE payment_id = ?',
        [paymentId]
      );
      if (existing) {
        return { status: existing.status, position: existing.position };
      }

      // Check if there is an active unexpired slot on this VPA
      const activeSlot = this.db.queryOne(
        `SELECT * FROM payment_queue 
         WHERE vpa = ? AND status = 'ACTIVE' AND datetime('now') < expires_at`,
        [vpa]
      );

      const id = generateId('q');

      if (!activeSlot) {
        // Slot is open! Grant ACTIVE status immediately
        const expiresAt = new Date(Date.now() + lockSeconds * 1000).toISOString();
        this.db.execute(
          `INSERT INTO payment_queue (id, vpa, payment_id, position, status, acquired_at, expires_at)
           VALUES (?, ?, ?, 0, 'ACTIVE', datetime('now'), ?)`,
          [id, vpa, paymentId, expiresAt]
        );
        this.db.execute("UPDATE payments SET status = 'ACTIVE' WHERE id = ?", [paymentId]);
        return { status: 'ACTIVE', position: 0 };
      }

      // Slot is occupied, calculate next queue position
      const maxPosRow = this.db.queryOne(
        `SELECT coalesce(max(position), 0) as maxPos FROM payment_queue WHERE vpa = ? AND status = 'WAITING'`,
        [vpa]
      );
      const nextPos = Number(maxPosRow.maxPos || 0) + 1;

      this.db.execute(
        `INSERT INTO payment_queue (id, vpa, payment_id, position, status)
         VALUES (?, ?, ?, ?, 'WAITING')`,
        [id, vpa, paymentId, nextPos]
      );
      this.db.execute("UPDATE payments SET status = 'QUEUED' WHERE id = ?", [paymentId]);

      return { status: 'WAITING', position: nextPos };
    });
  }

  /**
   * Releases an active slot and promotes the next waiting buyer in line.
   * @param {string} vpa
   * @param {string} paymentId
   * @param {number} [lockSeconds=300]
   * @returns {object|null} Next promoted payment slot if any
   */
  releaseSlot(vpa, paymentId, lockSeconds = 300) {
    return this.db.transaction(() => {
      // Mark current slot completed
      this.db.execute(
        `UPDATE payment_queue SET status = 'COMPLETED' WHERE payment_id = ?`,
        [paymentId]
      );

      // Find next candidate waiting in queue
      const nextInLine = this.db.queryOne(
        `SELECT * FROM payment_queue 
         WHERE vpa = ? AND status = 'WAITING' 
         ORDER BY position ASC, created_at ASC LIMIT 1`,
        [vpa]
      );

      if (!nextInLine) {
        return null;
      }

      // Promote to ACTIVE
      const expiresAt = new Date(Date.now() + lockSeconds * 1000).toISOString();
      this.db.execute(
        `UPDATE payment_queue 
         SET status = 'ACTIVE', position = 0, acquired_at = datetime('now'), expires_at = ?
         WHERE id = ?`,
        [expiresAt, nextInLine.id]
      );

      this.db.execute("UPDATE payments SET status = 'ACTIVE' WHERE id = ?", [nextInLine.payment_id]);

      // Decrement positions of subsequent waiting items
      this.db.execute(
        `UPDATE payment_queue SET position = position - 1 WHERE vpa = ? AND status = 'WAITING'`,
        [vpa]
      );

      return {
        promotedPaymentId: nextInLine.payment_id,
        expiresAt
      };
    });
  }

  /**
   * Get queue status for a payment.
   * @param {string} paymentId
   * @returns {{ status: string, position: number, expiresAt: string|null }}
   */
  getStatus(paymentId) {
    const row = this.db.queryOne(
      'SELECT status, position, expires_at FROM payment_queue WHERE payment_id = ?',
      [paymentId]
    );
    if (!row) return { status: 'NONE', position: 0, expiresAt: null };
    return {
      status: row.status,
      position: row.position,
      expiresAt: row.expires_at
    };
  }
}
