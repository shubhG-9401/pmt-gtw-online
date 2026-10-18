-- ==============================================================================
-- PMT GTW (ONLINE) — Core SQLite Relational Schema
-- Fully ACID Compliant, WAL-Optimized, Foreign Keys Enforced
-- ==============================================================================

PRAGMA foreign_keys = ON;

-- Merchants Table
CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vpa TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE,
  webhook_url TEXT,
  webhook_secret TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  branding_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_merchants_api_key ON merchants(api_key);
CREATE INDEX IF NOT EXISTS idx_merchants_vpa ON merchants(vpa);

-- Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  mobile_number TEXT NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  is_banned INTEGER NOT NULL DEFAULT 0,
  device_fingerprint TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobile_number);

-- Customer OTPs Table (WhatsApp & SMS)
CREATE TABLE IF NOT EXISTS customer_otps (
  id TEXT PRIMARY KEY,
  mobile_number TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customer_otps_mobile ON customer_otps(mobile_number);

-- Payments / Orders Table
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'CREATED',
  order_id TEXT,
  customer_mobile TEXT,
  customer_name TEXT,
  upi_uri TEXT,
  utr TEXT,
  payer_vpa TEXT,
  observation_channel TEXT,
  mode TEXT NOT NULL DEFAULT 'ONLINE',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_merchant ON payments(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_utr ON payments(utr);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- Payment FIFO Concurrency Queue
CREATE TABLE IF NOT EXISTS payment_queue (
  id TEXT PRIMARY KEY,
  vpa TEXT NOT NULL,
  payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'WAITING', -- 'WAITING', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED'
  acquired_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payment_queue_vpa ON payment_queue(vpa, status);

-- Observers (Android APK, Gmail, SMS)
CREATE TABLE IF NOT EXISTS observer_devices (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  fcm_token TEXT,
  hmac_secret TEXT NOT NULL,
  last_heartbeat TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_observer_devices_device_id ON observer_devices(device_id);

-- Raw and Parsed Banking Observation Events
CREATE TABLE IF NOT EXISTS observer_events (
  id TEXT PRIMARY KEY,
  observer_type TEXT NOT NULL, -- 'ANDROID_SMS', 'ANDROID_NOTIFICATION', 'GMAIL', 'WEB_SMS'
  raw_payload TEXT NOT NULL,
  parsed_amount REAL,
  parsed_utr TEXT,
  parsed_sender TEXT,
  matched_payment_id TEXT REFERENCES payments(id),
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'MATCHED', 'IGNORED', 'DUPLICATE'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_observer_events_utr ON observer_events(parsed_utr);
CREATE INDEX IF NOT EXISTS idx_observer_events_status ON observer_events(status);

-- Outbound Webhooks Queue & Log
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event TEXT NOT NULL, -- 'payment.success', 'payment.failed', 'payment.expired'
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'FAILED'
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  last_response_code INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhooks_status ON webhooks(status);

-- POS Counter Till Sessions
CREATE TABLE IF NOT EXISTS counter_sessions (
  id TEXT PRIMARY KEY,
  merchant_id TEXT NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  payment_id TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  cashier_id TEXT,
  till_id TEXT,
  payment_method TEXT NOT NULL, -- 'CASH', 'CARD', 'UPI_COUNTER'
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Security and Transaction Audit Trail
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
