// Idempotente: products.available (agotado) + tabla product_price_history.
//   node --env-file=.env            scripts/migrate-carta.mjs
//   node --env-file=.env.production scripts/migrate-carta.mjs
import { getDb } from '../src/db.js';

const db = getDb();
const cols = (await db.execute(`PRAGMA table_info(products)`)).rows.map((r) => r.name);
if (cols.includes('available')) console.log('= products.available ya existe');
else { await db.execute(`ALTER TABLE products ADD COLUMN available INTEGER NOT NULL DEFAULT 1`); console.log('✓ products.available agregada'); }

await db.execute(`CREATE TABLE IF NOT EXISTS product_price_history (
  id          TEXT PRIMARY KEY,
  product_id  TEXT NOT NULL,
  old_price   REAL,
  new_price   REAL NOT NULL,
  changed_by  TEXT,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_pph_product ON product_price_history(product_id, created_at)`);
console.log('✓ product_price_history OK');
