// Idempotente — Módulo Finanzas/Costos (Fase 1).
//   - product_cost_snapshots: foto histórica de costo/margen por producto.
//   - cost_deviation_alerts: alertas cuando la desviación supera el umbral.
//   - product_recipes.yield_pct + ingredients.waste_pct: merma/rendimiento parametrizable (default = comportamiento actual).
// Uso:
//   node --env-file=.env            scripts/migrate-finance-costs.mjs
//   node --env-file=.env.production scripts/migrate-finance-costs.mjs
import { getDb } from '../src/db.js';
const db = getDb();

await db.execute(`CREATE TABLE IF NOT EXISTS product_cost_snapshots (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL,
  captured_at   TEXT NOT NULL DEFAULT (datetime('now')),
  price         REAL,
  theo_unit_cost REAL,
  obs_unit_cost REAL,
  gross_margin  REAL,
  food_cost_pct REAL,
  source        TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_pcs_product ON product_cost_snapshots(product_id, captured_at)`);
console.log('✓ product_cost_snapshots OK');

await db.execute(`CREATE TABLE IF NOT EXISTS cost_deviation_alerts (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,
  expected      REAL,
  actual        REAL,
  deviation_pct REAL,
  threshold_pct REAL,
  status        TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at   TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_cda_status ON cost_deviation_alerts(status, created_at)`);
console.log('✓ cost_deviation_alerts OK');

const prCols = (await db.execute(`PRAGMA table_info(product_recipes)`)).rows.map((r) => r.name);
if (!prCols.includes('yield_pct')) {
  await db.execute(`ALTER TABLE product_recipes ADD COLUMN yield_pct REAL NOT NULL DEFAULT 100`);
  console.log('✓ product_recipes.yield_pct agregada');
} else console.log('= product_recipes.yield_pct ya existe');

const inCols = (await db.execute(`PRAGMA table_info(ingredients)`)).rows.map((r) => r.name);
if (!inCols.includes('waste_pct')) {
  await db.execute(`ALTER TABLE ingredients ADD COLUMN waste_pct REAL NOT NULL DEFAULT 0`);
  console.log('✓ ingredients.waste_pct agregada');
} else console.log('= ingredients.waste_pct ya existe');

console.log('\nListo — finance-costs.');
