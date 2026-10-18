import { generateId } from '@pmt/common';

export class PaymentRepository {
  /**
   * @param {import('../database.js').Database} db
   */
  constructor(db) {
    this.db = db;
  }

  create({
    merchantId,
    amount,
    currency = 'INR',
    orderId = null,
    customerMobile = null,
    customerName = null,
    upiUri = null,
    mode = 'ONLINE',
    expirySeconds = 300
  }) {
    const id = generateId('pmt');
    const expiresAt = new Date(Date.now() + expirySeconds * 1000).toISOString();

    this.db.execute(
      `INSERT INTO payments (id, merchant_id, amount, currency, status, order_id, customer_mobile, customer_name, upi_uri, mode, expires_at)
       VALUES (?, ?, ?, ?, 'CREATED', ?, ?, ?, ?, ?, ?)`,
      [id, merchantId, Number(amount), currency, orderId, customerMobile, customerName, upiUri, mode, expiresAt]
    );

    return this.findById(id);
  }

  findById(id) {
    return this.db.queryOne('SELECT * FROM payments WHERE id = ?', [id]);
  }

  findByOrderId(merchantId, orderId) {
    return this.db.queryOne('SELECT * FROM payments WHERE merchant_id = ? AND order_id = ?', [merchantId, orderId]);
  }

  findByUtr(utr) {
    return this.db.queryOne('SELECT * FROM payments WHERE utr = ?', [utr]);
  }

  updateStatus(id, status, extra = {}) {
    const sets = ['status = ?', "updated_at = datetime('now')"];
    const params = [status];

    if (extra.utr) {
      sets.push('utr = ?');
      params.push(extra.utr);
    }
    if (extra.payerVpa) {
      sets.push('payer_vpa = ?');
      params.push(extra.payerVpa);
    }
    if (extra.observationChannel) {
      sets.push('observation_channel = ?');
      params.push(extra.observationChannel);
    }
    if (extra.upiUri) {
      sets.push('upi_uri = ?');
      params.push(extra.upiUri);
    }

    params.push(id);
    this.db.execute(`UPDATE payments SET ${sets.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  markSuccess(id, { utr, payerVpa = null, observationChannel = 'OBSERVER' }) {
    return this.updateStatus(id, 'SUCCESS', { utr, payerVpa, observationChannel });
  }

  markFailed(id, reason = '') {
    return this.updateStatus(id, 'FAILED');
  }

  markExpired(id) {
    return this.updateStatus(id, 'EXPIRED');
  }

  markCancelled(id) {
    return this.updateStatus(id, 'CANCELLED');
  }

  findPendingForMatching(amount, toleranceSeconds = 600) {
    return this.db.query(
      `SELECT * FROM payments
       WHERE status IN ('CREATED', 'ACTIVE', 'PAYING', 'VERIFYING')
         AND amount = ?
         AND created_at >= datetime('now', '-' || ? || ' seconds')
       ORDER BY created_at ASC`,
      [Number(amount), toleranceSeconds]
    );
  }

  list(filters = {}) {
    const conditions = ['1=1'];
    const params = [];

    if (filters.merchantId) {
      conditions.push('merchant_id = ?');
      params.push(filters.merchantId);
    }
    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }
    if (filters.search) {
      conditions.push('(id LIKE ? OR order_id LIKE ? OR customer_mobile LIKE ? OR utr LIKE ?)');
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }

    const limit = Math.min(Number(filters.limit) || 50, 200);
    const offset = Number(filters.offset) || 0;

    params.push(limit, offset);

    return this.db.query(
      `SELECT * FROM payments WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      params
    );
  }

  getMetrics(merchantId = null) {
    const where = merchantId ? 'WHERE merchant_id = ?' : '';
    const params = merchantId ? [merchantId] : [];

    const totalRow = this.db.queryOne(
      `SELECT 
         count(*) as totalCount,
         coalesce(sum(case when status = 'SUCCESS' then amount else 0 end), 0) as totalVolume,
         coalesce(sum(case when status = 'SUCCESS' then 1 else 0 end), 0) as successCount,
         coalesce(sum(case when status = 'FAILED' then 1 else 0 end), 0) as failedCount,
         coalesce(sum(case when status IN ('CREATED', 'ACTIVE', 'PAYING') then 1 else 0 end), 0) as pendingCount
       FROM payments ${where}`,
      params
    );

    const total = Number(totalRow.totalCount || 0);
    const success = Number(totalRow.successCount || 0);
    const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : '100.0';

    return {
      totalVolume: Number(totalRow.totalVolume || 0),
      totalTransactions: total,
      successCount: success,
      failedCount: Number(totalRow.failedCount || 0),
      pendingCount: Number(totalRow.pendingCount || 0),
      successRate: parseFloat(successRate)
    };
  }
}
