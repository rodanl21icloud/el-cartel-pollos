// Idempotente — Centro de Operaciones Diario.
//   - operational_day: 1 día = 1 apertura + 1 cierre (ancla del día).
//   - ops_checklist_item: ítems de apertura/cierre (se siembran por día desde plantilla).
//   - ops_task: alertas (auto) y tareas correctivas (manual). Bandeja única.
//   - ops_config: metas/umbrales por KPI (clave/valor, editable).
//   - ingredients.is_critical: marca insumos críticos (reutiliza el inventario actual).
// Uso:
//   node --env-file=.env            scripts/migrate-ops.mjs
//   node --env-file=.env.production scripts/migrate-ops.mjs
import { getDb } from '../src/db.js';
const db = getDb();

await db.execute(`CREATE TABLE IF NOT EXISTS operational_day (
  day            TEXT PRIMARY KEY,                 -- 'YYYY-MM-DD' (America/Santiago)
  opened_by      TEXT, opened_at TEXT,
  closed_by      TEXT, closed_at TEXT,
  opening_status TEXT NOT NULL DEFAULT 'NO_INICIADA' CHECK (opening_status IN ('NO_INICIADA','PARCIAL','COMPLETA')),
  closing_status TEXT NOT NULL DEFAULT 'NO_INICIADO' CHECK (closing_status IN ('NO_INICIADO','PARCIAL','COMPLETO')),
  kpi_snapshot   TEXT,                             -- JSON congelado al cierre (trazabilidad)
  notes          TEXT,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
)`);
console.log('✓ operational_day OK');

await db.execute(`CREATE TABLE IF NOT EXISTS ops_checklist_item (
  id            TEXT PRIMARY KEY,
  day           TEXT NOT NULL,
  phase         TEXT NOT NULL CHECK (phase IN ('APERTURA','CIERRE')),
  label         TEXT NOT NULL,
  is_critical   INTEGER NOT NULL DEFAULT 0 CHECK (is_critical IN (0,1)),
  status        TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE','SI','NO','NA')),
  note          TEXT,
  responsible_id TEXT,
  done_at       TEXT,
  sort          INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (day) REFERENCES operational_day(day) ON DELETE CASCADE,
  FOREIGN KEY (responsible_id) REFERENCES users(id) ON DELETE SET NULL
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_ops_item_day ON ops_checklist_item(day, phase, sort)`);
console.log('✓ ops_checklist_item OK');

await db.execute(`CREATE TABLE IF NOT EXISTS ops_task (
  id             TEXT PRIMARY KEY,
  day            TEXT,
  kind           TEXT NOT NULL DEFAULT 'TAREA' CHECK (kind IN ('ALERTA','TAREA')),
  title          TEXT NOT NULL,
  description    TEXT,
  impact         TEXT,
  suggested_action TEXT,
  priority       TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('alta','media','baja')),
  responsible_id TEXT,
  due_date       TEXT,
  status         TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','en_proceso','resuelta','descartada')),
  source_type    TEXT,                             -- KPI | CHECKLIST | ALERT | MANUAL
  source_id      TEXT,                             -- clave determinística (evita duplicar alertas)
  resolution     TEXT,
  created_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (responsible_id) REFERENCES users(id) ON DELETE SET NULL
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_ops_task_day ON ops_task(day, status)`);
// Evita alertas duplicadas para la misma causa en el mismo día.
await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_ops_alert ON ops_task(day, source_type, source_id) WHERE source_id IS NOT NULL`);
console.log('✓ ops_task OK');

await db.execute(`CREATE TABLE IF NOT EXISTS ops_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
const cfg = [
  ['daily_sales_target', '350000'],   // meta de venta diaria (CLP)
  ['ticket_target', '12000'],         // ticket promedio objetivo
  ['waste_threshold_clp', '20000'],   // merma diaria que dispara alerta
  ['cash_diff_tolerance', '1000'],    // tolerancia de descuadre de caja
  ['labor_pct_target', '25'],         // % objetivo de costo de personal (si hubiera datos)
];
for (const [k, v] of cfg) await db.execute({ sql: `INSERT OR IGNORE INTO ops_config (key, value) VALUES (?, ?)`, args: [k, v] });
console.log('✓ ops_config OK (metas/umbrales sembrados)');

const inCols = (await db.execute(`PRAGMA table_info(ingredients)`)).rows.map((r) => r.name);
if (!inCols.includes('is_critical')) {
  await db.execute(`ALTER TABLE ingredients ADD COLUMN is_critical INTEGER NOT NULL DEFAULT 0`);
  console.log('✓ ingredients.is_critical agregada');
} else console.log('= ingredients.is_critical ya existe');
// Marca como críticos los insumos clave por nombre (idempotente).
await db.execute(`UPDATE ingredients SET is_critical = 1
  WHERE is_active = 1 AND (name LIKE '%ollo%' OR name LIKE '%apa%' OR name LIKE '%ebida%' OR name LIKE '%nvase%' OR name LIKE '%mpaque%' OR name LIKE '%acking%' OR name LIKE '%ceite%')`);
const crit = (await db.execute(`SELECT COUNT(*) c FROM ingredients WHERE is_critical = 1`)).rows[0].c;
console.log(`✓ insumos críticos marcados: ${crit}`);

console.log('\nListo — ops.');
