import { generateId } from '@pmt/common';

export class ObserverRepository {
  /**
   * @param {import('../database.js').Database} db
   */
  constructor(db) {
    this.db = db;
  }

  findDeviceById(deviceId) {
    return this.db.queryOne('SELECT * FROM observer_devices WHERE device_id = ? AND is_active = 1', [deviceId]);
  }

  registerDevice({ deviceId, deviceName, hmacSecret }) {
    const existing = this.findDeviceById(deviceId);
    if (existing) {
      this.db.execute(
        `UPDATE observer_devices SET device_name = ?, hmac_secret = ?, last_heartbeat = datetime('now') WHERE device_id = ?`,
        [deviceName, hmacSecret, deviceId]
      );
      return this.findDeviceById(deviceId);
    }

    const id = generateId('obs');
    this.db.execute(
      `INSERT INTO observer_devices (id, device_id, device_name, hmac_secret, last_heartbeat)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [id, deviceId, deviceName, hmacSecret]
    );
    return this.findDeviceById(deviceId);
  }

  updateHeartbeat(deviceId) {
    this.db.execute(`UPDATE observer_devices SET last_heartbeat = datetime('now') WHERE device_id = ?`, [deviceId]);
  }

  recordEvent({ observerType, rawPayload, parsedAmount, parsedUtr, parsedSender, matchedPaymentId = null, status = 'PENDING' }) {
    const id = generateId('obsev');
    const rawStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);

    this.db.execute(
      `INSERT INTO observer_events (id, observer_type, raw_payload, parsed_amount, parsed_utr, parsed_sender, matched_payment_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, observerType, rawStr, parsedAmount !== null ? Number(parsedAmount) : null, parsedUtr, parsedSender, matchedPaymentId, status]
    );

    return this.db.queryOne('SELECT * FROM observer_events WHERE id = ?', [id]);
  }

  findByUtr(utr) {
    return this.db.queryOne('SELECT * FROM observer_events WHERE parsed_utr = ?', [utr]);
  }

  updateEventStatus(id, status, matchedPaymentId = null) {
    this.db.execute(
      `UPDATE observer_events SET status = ?, matched_payment_id = coalesce(?, matched_payment_id) WHERE id = ?`,
      [status, matchedPaymentId, id]
    );
  }

  listEvents(limit = 50) {
    return this.db.query('SELECT * FROM observer_events ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  listDevices() {
    return this.db.query('SELECT * FROM observer_devices ORDER BY last_heartbeat DESC');
  }
}
