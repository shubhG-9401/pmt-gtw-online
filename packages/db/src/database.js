import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from './migrate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDbDir = path.resolve(__dirname, '../../../data');

/**
 * Universal SQLite Database Wrapper using Node.js native DatabaseSync.
 * Guarantees zero-dependency embedded database execution with ACID integrity.
 */
export class Database {
  /**
   * @param {object} [options={}]
   * @param {string} [options.dbPath]
   * @param {boolean} [options.inMemory=false]
   * @param {boolean} [options.autoMigrate=true]
   */
  constructor(options = {}) {
    if (options.inMemory) {
      this.db = new DatabaseSync(':memory:');
    } else {
      let dbPath;
      if (options.dbPath) {
        dbPath = path.isAbsolute(options.dbPath)
          ? options.dbPath
          : path.resolve(process.cwd(), options.dbPath);
      } else if (process.env.SQLITE_DB_PATH) {
        dbPath = path.isAbsolute(process.env.SQLITE_DB_PATH)
          ? process.env.SQLITE_DB_PATH
          : path.resolve(process.cwd(), process.env.SQLITE_DB_PATH);
      } else {
        if (!fs.existsSync(defaultDbDir)) {
          fs.mkdirSync(defaultDbDir, { recursive: true });
        }
        dbPath = path.join(defaultDbDir, 'pmt_gateway.sqlite');
      }

      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new DatabaseSync(dbPath);
    }

    // Configure SQLite PRAGMAs for high-performance multi-connection concurrency
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 10000;');
    try {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
    } catch {}

    if (options.autoMigrate !== false) {
      this.ensureInitialized();
    }
  }

  ensureInitialized() {
    try {
      const row = this.queryOne("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='merchants'");
      if (!row || Number(row.count) === 0) {
        runMigrations(this);
      }
    } catch {
      runMigrations(this);
    }
  }

  /**
   * Normalize PostgreSQL-style $1, $2 markers to SQLite ? markers.
   */
  normalizeSql(sql) {
    return sql.replace(/\$\d+/g, '?');
  }

  /**
   * Execute an INSERT, UPDATE, or DELETE statement.
   * @param {string} sql
   * @param {any[]} [params=[]]
   * @returns {{ changes: number, lastInsertRowid: number | bigint }}
   */
  execute(sql, params = []) {
    const stmt = this.db.prepare(this.normalizeSql(sql));
    return stmt.run(...params);
  }

  run(sql, params = []) {
    return this.execute(sql, params);
  }

  /**
   * Query all matching rows.
   * @param {string} sql
   * @param {any[]} [params=[]]
   * @returns {any[]}
   */
  query(sql, params = []) {
    const stmt = this.db.prepare(this.normalizeSql(sql));
    return stmt.all(...params);
  }

  /**
   * Query a single row or null.
   * @param {string} sql
   * @param {any[]} [params=[]]
   * @returns {any | null}
   */
  queryOne(sql, params = []) {
    const stmt = this.db.prepare(this.normalizeSql(sql));
    const res = stmt.get(...params);
    return res !== undefined ? res : null;
  }

  /**
   * Execute raw DDL or multi-statement script.
   * @param {string} sql
   */
  exec(sql) {
    this.db.exec(sql);
  }

  /**
   * Execute a function inside an ACID transaction with BEGIN IMMEDIATE.
   * @template T
   * @param {() => T} callback
   * @returns {T}
   */
  transaction(callback) {
    this.db.exec('BEGIN IMMEDIATE;');
    try {
      const result = callback();
      this.db.exec('COMMIT;');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch {}
      throw err;
    }
  }

  /**
   * Close database connection.
   */
  close() {
    this.db.close();
  }
}

let defaultInstance = null;

/**
 * Returns singleton database instance.
 * @param {object} [options={}]
 * @returns {Database}
 */
export function getDatabase(options = {}) {
  if (!defaultInstance) {
    defaultInstance = new Database(options);
  }
  return defaultInstance;
}

export function resetDefaultDatabase() {
  if (defaultInstance) {
    try { defaultInstance.close(); } catch {}
    defaultInstance = null;
  }
}
