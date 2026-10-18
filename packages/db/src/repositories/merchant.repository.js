export class MerchantRepository {
  /**
   * @param {import('../database.js').Database} db
   */
  constructor(db) {
    this.db = db;
  }

  findById(id) {
    return this.db.queryOne('SELECT * FROM merchants WHERE id = ?', [id]);
  }

  findByApiKey(apiKey) {
    return this.db.queryOne('SELECT * FROM merchants WHERE api_key = ? AND is_active = 1', [apiKey]);
  }

  getDefaultMerchant() {
    return this.db.queryOne('SELECT * FROM merchants WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1');
  }

  updateBranding(id, branding) {
    const json = typeof branding === 'string' ? branding : JSON.stringify(branding);
    this.db.execute(
      `UPDATE merchants SET branding_json = ?, updated_at = datetime('now') WHERE id = ?`,
      [json, id]
    );
    return this.findById(id);
  }

  updateVpa(id, vpa) {
    this.db.execute(
      `UPDATE merchants SET vpa = ?, updated_at = datetime('now') WHERE id = ?`,
      [vpa, id]
    );
    return this.findById(id);
  }

  updateWebhook(id, webhookUrl, webhookSecret) {
    this.db.execute(
      `UPDATE merchants SET webhook_url = ?, webhook_secret = ?, updated_at = datetime('now') WHERE id = ?`,
      [webhookUrl, webhookSecret, id]
    );
    return this.findById(id);
  }

  getAll() {
    return this.db.query('SELECT * FROM merchants ORDER BY created_at DESC');
  }
}
