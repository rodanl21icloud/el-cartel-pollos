// Migración idempotente: agrega 'litro' al CHECK de ingredients.unit.
// SQLite no permite ALTER de un CHECK -> se reconstruye la tabla.
//   node --env-file=.env            scripts/migrate-litro.mjs
//   node --env-file=.env.production scripts/migrate-litro.mjs
import { getDb } from '../src/db.js';

const db = getDb();
const cur = (await db.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='ingredients'`)).rows[0]?.sql || '';
if (cur.includes("'litro'")) { console.log('= ingredients.unit ya admite litro'); process.exit(0); }

await db.execute('PRAGMA foreign_keys=OFF');
await db.execute(`CREATE TABLE ingredients_new (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  unit            TEXT NOT NULL CHECK (unit IN ('unidad','gramo','mililitro','litro','empaque')),
  stock_qty       REAL NOT NULL DEFAULT 0,
  min_stock_qty   REAL NOT NULL DEFAULT 0,
  cost_unit       REAL NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
)`);
await db.execute('INSERT INTO ingredients_new SELECT id, name, unit, stock_qty, min_stock_qty, cost_unit, is_active, created_at, updated_at FROM ingredients');
await db.execute('DROP TABLE ingredients');
await db.execute('ALTER TABLE ingredients_new RENAME TO ingredients');
await db.execute('PRAGMA foreign_keys=ON');

const n = (await db.execute('SELECT COUNT(*) c FROM ingredients')).rows[0].c;
console.log(`✓ ingredients reconstruida con unidad "litro" (${n} insumos conservados)`);
