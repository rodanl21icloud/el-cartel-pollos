// Idempotente — Módulo Comercial/Marketing.
// REUTILIZA (no duplica): clients, sales, sale_items, products.
// Crea SOLO lo que falta del dominio marketing:
//   - campaigns: campañas/promociones comerciales.
//   - loyalty_accounts + loyalty_transactions: fidelización básica por cliente.
// La segmentación de clientes es DINÁMICA (RFM calculado desde sales), no se persiste
// en esta fase para no duplicar la fuente de verdad (clients/sales).
// Uso:
//   node --env-file=.env            scripts/migrate-marketing.mjs
//   node --env-file=.env.production scripts/migrate-marketing.mjs
import { getDb } from '../src/db.js';
const db = getDb();

await db.execute(`CREATE TABLE IF NOT EXISTS campaigns (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  channel        TEXT NOT NULL DEFAULT 'WHATSAPP' CHECK (channel IN ('WHATSAPP','LOCAL','REDES','OTRO')),
  segment        TEXT,                          -- segmento objetivo (dinámico): vip/frecuente/dormido/nuevo/ocasional/todos
  discount_type  TEXT CHECK (discount_type IN ('PORCENTAJE','MONTO','2X1','COMBO','NINGUNO')),
  discount_value REAL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','activa','pausada','finalizada')),
  starts_at      TEXT,
  ends_at        TEXT,
  created_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status, starts_at)`);
console.log('✓ campaigns OK');

await db.execute(`CREATE TABLE IF NOT EXISTS loyalty_accounts (
  client_id  TEXT PRIMARY KEY,
  points     INTEGER NOT NULL DEFAULT 0,
  tier       TEXT NOT NULL DEFAULT 'BRONCE' CHECK (tier IN ('BRONCE','PLATA','ORO')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
)`);
console.log('✓ loyalty_accounts OK');

await db.execute(`CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id         TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('EARN','REDEEM','ADJUST')),
  points     INTEGER NOT NULL,
  sale_id    TEXT,
  reason     TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (sale_id)   REFERENCES sales(id)   ON DELETE SET NULL
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_loyalty_tx_client ON loyalty_transactions(client_id, created_at)`);
console.log('✓ loyalty_transactions OK');

console.log('\nListo — marketing.');
