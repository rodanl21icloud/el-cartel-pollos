// Idempotente — Módulo Finanzas/Tax Forecaster (Fase 3).
//   - tax_period_snapshots: foto de cierre tributario estimado por período.
//   - tax_simulation_scenarios + tax_simulation_entries: escenarios "qué pasa si".
//   (tax_config ya existe desde la Fase 2: iva_rate, ppm_rate, regime.)
// Uso:
//   node --env-file=.env            scripts/migrate-finance-tax.mjs
//   node --env-file=.env.production scripts/migrate-finance-tax.mjs
import { getDb } from '../src/db.js';
const db = getDb();

await db.execute(`CREATE TABLE IF NOT EXISTS tax_period_snapshots (
  id              TEXT PRIMARY KEY,
  period          TEXT NOT NULL,            -- 'YYYY-MM'
  iva_debito      REAL NOT NULL DEFAULT 0,
  iva_credito     REAL NOT NULL DEFAULT 0,
  iva_neto        REAL NOT NULL DEFAULT 0,
  ppm             REAL NOT NULL DEFAULT 0,
  ventas_netas    REAL NOT NULL DEFAULT 0,
  cutoff_at       TEXT NOT NULL DEFAULT (datetime('now')),
  assumptions_json TEXT,
  status          TEXT NOT NULL DEFAULT 'ESTIMADO',
  created_by      TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
)`);
console.log('✓ tax_period_snapshots OK');

await db.execute(`CREATE TABLE IF NOT EXISTS tax_simulation_scenarios (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  period      TEXT NOT NULL,
  base_json   TEXT,                          -- forecast base congelado al crear
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
)`);
await db.execute(`CREATE TABLE IF NOT EXISTS tax_simulation_entries (
  id          TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('COMPRA','INVERSION','VENTA')),
  description TEXT,
  net_amount  REAL NOT NULL DEFAULT 0,       -- monto neto (sin IVA)
  iva         REAL NOT NULL DEFAULT 0,       -- IVA del movimiento
  treatment   TEXT NOT NULL DEFAULT 'gasto' CHECK (treatment IN ('gasto','activo','venta')),
  FOREIGN KEY (scenario_id) REFERENCES tax_simulation_scenarios(id) ON DELETE CASCADE
)`);
console.log('✓ tax_simulation_scenarios + entries OK');

console.log('\nListo — finance-tax.');
