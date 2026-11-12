import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { catalog } from './catalog.mjs';

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
      category TEXT NOT NULL, price INTEGER NOT NULL, alcohol INTEGER NOT NULL,
      available INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1), accepting INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO settings VALUES (1, 1);
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, account INTEGER REFERENCES accounts(id),
      staff INTEGER NOT NULL DEFAULT 0, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY, token TEXT NOT NULL UNIQUE, request_id TEXT NOT NULL UNIQUE,
      account INTEGER REFERENCES accounts(id), items TEXT NOT NULL,
      subtotal INTEGER NOT NULL, discount INTEGER NOT NULL, total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL, code TEXT,
      delivered INTEGER, received INTEGER, provider TEXT, external_id TEXT UNIQUE,
      checkout_url TEXT, payment_email TEXT, channel TEXT, recipient TEXT,
      consent INTEGER, link_token TEXT UNIQUE, link_expires INTEGER,
      notification TEXT, notified INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ready_pickup_code ON orders(code) WHERE status = 'ready';
  `);
  const existing = new Set(db.prepare('PRAGMA table_info(orders)').all().map(column => column.name));
  for (const [name, type] of Object.entries({
    sector: "TEXT NOT NULL DEFAULT 'general'", pickup: 'TEXT',
    paid_at: 'INTEGER', preparing_at: 'INTEGER', ready_at: 'INTEGER', reversed_at: 'INTEGER',
  })) {
    if (!existing.has(name)) db.exec('ALTER TABLE orders ADD COLUMN ' + name + ' ' + type);
  }
  db.exec('CREATE INDEX IF NOT EXISTS orders_paid_at ON orders(paid_at)');
  const seed = db.prepare('INSERT OR IGNORE INTO products (id, name, description, category, price, alcohol) VALUES (?, ?, ?, ?, ?, ?)');
  for (const item of catalog) seed.run(item.id, item.name, item.description, item.category, item.price, item.alcohol);
  return db;
}
