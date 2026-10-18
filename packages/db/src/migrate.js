import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, 'schema.sql');

/**
 * Execute DDL schema migrations and default bootstrap seed data.
 * @param {import('./database.js').Database} db
 */
export function runMigrations(db) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);

  // Seed default merchant if not exists
  const defaultMerchantId = process.env.DEFAULT_MERCHANT_ID || '00000000-0000-0000-0000-000000000001';
  const existing = db.queryOne('SELECT id FROM merchants WHERE id = ?', [defaultMerchantId]);

  if (!existing) {
    const merchantName = process.env.DEFAULT_MERCHANT_NAME || 'PMT Digital Store';
    const merchantVpa = process.env.DEFAULT_MERCHANT_VPA || 'merchant@okhdfcbank';
    const apiKey = process.env.DEFAULT_MERCHANT_API_KEY || 'pmt_live_sec_99a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4';
    const webhookSecret = process.env.DEFAULT_MERCHANT_WEBHOOK_SECRET || 'pmt_whsec_77b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2';
    const branding = JSON.stringify({
      brandName: 'PMT Gateway',
      accentColor: '#2563eb',
      logoUrl: '',
      theme: 'dark'
    });

    db.execute(
      `INSERT INTO merchants (id, name, vpa, api_key, webhook_url, webhook_secret, is_active, branding_json)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [defaultMerchantId, merchantName, merchantVpa, apiKey, 'http://localhost:5000/api/webhook', webhookSecret, branding]
    );

    // Seed default customer
    db.execute(
      `INSERT OR IGNORE INTO customers (id, mobile_number, name, email)
       VALUES ('cust_000001', '9876543210', 'Alex Johnson', 'alex@example.com')`
    );

    // Seed default observer device
    db.execute(
      `INSERT OR IGNORE INTO observer_devices (id, device_id, device_name, hmac_secret)
       VALUES ('obs_000001', 'android_pixel_01', 'Android Bank SMS Observer', 'pmt_obs_sec_112233445566778899aabbcc')`
    );
  }
}

export function ensureDatabaseInitialized(db) {
  runMigrations(db);
}
