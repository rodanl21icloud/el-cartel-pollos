// Idempotente — amplía las unidades de medida de los insumos.
// SQLite no permite ALTER de un CHECK, así que reconstruye la tabla ingredients
// con el CHECK ampliado (agrega 'kilo' y 'onza'; conserva las existentes).
// Preserva datos, UNIQUE(name) y columnas opcionales (waste_pct, is_critical).
// Uso:
//   node --env-file=.env            scripts/migrate-units.mjs
//   node --env-file=.env.production scripts/migrate-units.mjs
import { getDb } from '../src/db.js';
const db = getDb();

const def = (await db.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='ingredients'`)).rows[0]?.sql || '';
if (/'kilo'/.test(def)) { console.log('= ingredients.unit ya incluye kilo/onza'); process.exit(0); }

const cols = (await db.execute(`PRAGMA table_info(ingredients)`)).rows.map((r) => r.name);
const hasWaste = cols.includes('waste_pct');
const hasCrit = cols.includes('is_critical');
const extraDefs = (hasWaste ? `,\n  waste_pct REAL NOT NULL DEFAULT 0` : '') + (hasCrit ? `,\n  is_critical INTEGER NOT NULL DEFAULT 0` : '');
const base = 'id, name, unit, stock_qty, min_stock_qty, cost_unit, is_active, created_at, updated_at';
const extraCols = (hasWaste ? ', waste_pct' : '') + (hasCrit ? ', is_critical' : '');

await db.execute(`PRAGMA foreign_keys=OFF`);
await db.execute(`CREATE TABLE ingredients_new (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  unit            TEXT NOT NULL CHECK (unit IN ('unidad','kilo','gramo','onza','litro','mililitro','empaque')),
  stock_qty       REAL NOT NULL DEFAULT 0,
  min_stock_qty   REAL NOT NULL DEFAULT 0,
  cost_unit       REAL NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))${extraDefs}
)`);
await db.execute(`INSERT INTO ingredients_new (${base}${extraCols}) SELECT ${base}${extraCols} FROM ingredients`);
await db.execute(`DROP TABLE ingredients`);
await db.execute(`ALTER TABLE ingredients_new RENAME TO ingredients`);
await db.execute(`PRAGMA foreign_keys=ON`);

const n = (await db.execute(`SELECT COUNT(*) c FROM ingredients`)).rows[0].c;
console.log(`✓ ingredients.unit ahora soporta kilo y onza (${n} insumos preservados)`);
console.log('Listo — units.');
