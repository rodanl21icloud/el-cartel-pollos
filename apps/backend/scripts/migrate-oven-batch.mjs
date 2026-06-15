// Migración idempotente: crea la tabla oven_batch (producción de pollo del turno).
// Uso: node scripts/migrate-oven-batch.mjs
import { getDb } from '../src/db.js';

const db = getDb();
await db.execute(`CREATE TABLE IF NOT EXISTS oven_batch (
  id           TEXT PRIMARY KEY,
  session_id   TEXT,
  user_id      TEXT NOT NULL,
  business_day TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('HORNO','PRECOCIDO')),
  qty          INTEGER NOT NULL CHECK (qty > 0),
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES cash_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id)    REFERENCES users(id)         ON DELETE RESTRICT
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_oven_day ON oven_batch(business_day, kind)`);
console.log('✓ oven_batch lista (tabla + índice).');
