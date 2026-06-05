// Controllers del Tax Forecaster. Lógica en services/finance/taxForecast.
import { forecast, saveSimulation, getSimulation, getTaxConfig } from '../services/finance/taxForecast.js';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

const periodOk = (p) => /^\d{4}-\d{2}$/.test(String(p || ''));
const thisMonth = () => new Date().toISOString().slice(0, 7);

/** GET /api/finance/tax/forecast?period=YYYY-MM  (reports.view) */
export async function taxForecast(req, res) {
  const period = req.query.period || thisMonth();
  if (!periodOk(period)) return res.status(400).json({ error: 'PERIODO_INVALIDO' });
  res.json(await forecast(period));
}

/** POST /api/finance/tax/simulations  Body: { name, period, entries[] }  (reports.view) */
export async function createSimulation(req, res) {
  const { name, period = thisMonth(), entries } = req.body || {};
  if (!periodOk(period)) return res.status(400).json({ error: 'PERIODO_INVALIDO' });
  if (entries && !Array.isArray(entries)) return res.status(400).json({ error: 'ENTRIES_INVALIDO' });
  const sim = await saveSimulation({ name, period, entries: entries || [], createdBy: req.user.id });
  res.status(201).json(sim);
}

/** GET /api/finance/tax/simulations/:id  (reports.view) */
export async function readSimulation(req, res) {
  const sim = await getSimulation(req.params.id);
  if (!sim) return res.status(404).json({ error: 'ESCENARIO_NO_ENCONTRADO' });
  res.json(sim);
}

/** GET /api/finance/tax/config  (reports.view) */
export async function readTaxConfig(_req, res) {
  res.json(await getTaxConfig());
}

/** PUT /api/finance/tax/config  Body: { iva_rate?, ppm_rate?, regime? }  (expenses.manage) */
export async function updateTaxConfig(req, res) {
  const db = getDb();
  const allowed = ['iva_rate', 'ppm_rate', 'regime'];
  const entries = Object.entries(req.body || {}).filter(([k]) => allowed.includes(k));
  if (!entries.length) return res.status(400).json({ error: 'SIN_CAMBIOS' });
  for (const [k, v] of entries) {
    await db.execute({
      sql: `INSERT INTO tax_config (key, value, updated_at) VALUES (?,?, datetime('now'))
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`,
      args: [k, String(v)],
    });
  }
  await writeAudit({ userId: req.user.id, action: 'TAX_CONFIG_UPDATE', entity: 'tax_config', entityId: null,
    severity: 'WARN', ip: req.ip, metadata: Object.fromEntries(entries) });
  res.json(await getTaxConfig());
}
