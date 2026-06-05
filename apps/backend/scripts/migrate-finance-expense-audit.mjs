// Idempotente — Módulo Finanzas/Auditoría de Gastos (Fase 2).
//   - expense_tax_metadata: metadata tributaria por gasto (RUT, doc, crédito, giro).
//   - expense_audit_reviews: estado de revisión por gasto (upsert por expense_id).
//   - tax_config: parámetros tributarios (clave/valor) — compartido con Fase 3 (Tax Forecaster).
// Uso:
//   node --env-file=.env            scripts/migrate-finance-expense-audit.mjs
//   node --env-file=.env.production scripts/migrate-finance-expense-audit.mjs
import { getDb } from '../src/db.js';
const db = getDb();

await db.execute(`CREATE TABLE IF NOT EXISTS expense_tax_metadata (
  expense_id    TEXT PRIMARY KEY,
  supplier_rut  TEXT,
  company_rut   TEXT,
  doc_type      TEXT,                 -- BOLETA | FACTURA | NINGUNO | OTRO
  doc_number    TEXT,
  gives_credit  INTEGER NOT NULL DEFAULT 0 CHECK (gives_credit IN (0,1)),
  tax_category  TEXT,
  giro_relation TEXT DEFAULT 'directo' CHECK (giro_relation IN ('directo','indirecto','dudoso')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE CASCADE
)`);
console.log('✓ expense_tax_metadata OK');

await db.execute(`CREATE TABLE IF NOT EXISTS expense_audit_reviews (
  expense_id   TEXT PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','revisado','confirmado','observacion')),
  reason       TEXT,
  reviewed_by  TEXT,
  reviewed_at  TEXT,
  notes        TEXT,
  FOREIGN KEY (expense_id)  REFERENCES expenses(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)    ON DELETE SET NULL
)`);
console.log('✓ expense_audit_reviews OK');

await db.execute(`CREATE TABLE IF NOT EXISTS tax_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
// Parámetros por defecto (NO hardcodeados en el cálculo: viven aquí y son editables).
const defaults = [
  ['iva_rate', '0.19'],
  ['ppm_rate', '0'],
  ['audit_no_doc_threshold', '50000'], // gasto sin documento sobre este monto => riesgo alto
  ['regime', 'PRO_PYME'],
];
for (const [k, v] of defaults) {
  await db.execute({ sql: `INSERT OR IGNORE INTO tax_config (key, value) VALUES (?, ?)`, args: [k, v] });
}
console.log('✓ tax_config OK (defaults sembrados)');

console.log('\nListo — finance-expense-audit.');
