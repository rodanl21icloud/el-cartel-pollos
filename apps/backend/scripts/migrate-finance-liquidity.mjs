// Idempotente — Módulo Finanzas/Liquidez (Fase 4).
//   - cash_policy_settings: política de caja (buffer mínimo, horizonte, base de proyección).
//   - liquidity_scenarios: escenarios de retiro/reinversión guardados.
// Uso:
//   node --env-file=.env            scripts/migrate-finance-liquidity.mjs
//   node --env-file=.env.production scripts/migrate-finance-liquidity.mjs
import { getDb } from '../src/db.js';
const db = getDb();

await db.execute(`CREATE TABLE IF NOT EXISTS cash_policy_settings (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  min_buffer   REAL NOT NULL DEFAULT 500000,   -- colchón mínimo para operar
  horizon_days INTEGER NOT NULL DEFAULT 30,
  sales_basis  TEXT NOT NULL DEFAULT 'promedio' CHECK (sales_basis IN ('promedio','tendencia')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
)`);
await db.execute({ sql: `INSERT OR IGNORE INTO cash_policy_settings (id) VALUES (1)`, args: [] });
console.log('✓ cash_policy_settings OK');

await db.execute(`CREATE TABLE IF NOT EXISTS liquidity_scenarios (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('RETIRO','COMPRA','INVERSION','INGRESO')),
  delta_amount REAL NOT NULL DEFAULT 0,
  created_by   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
)`);
console.log('✓ liquidity_scenarios OK');

console.log('\nListo — finance-liquidity.');
