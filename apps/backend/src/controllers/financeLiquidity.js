// Controllers de Liquidez. Lógica en services/finance/liquidity.
import { liquiditySummary, applyScenario, setPolicy } from '../services/finance/liquidity.js';
import { writeAudit } from '../services/audit.js';

/** GET /api/finance/liquidity/summary  (reports.view) */
export async function liquidity(_req, res) {
  res.json(await liquiditySummary());
}

/** POST /api/finance/liquidity/scenarios  Body: { name, kind, delta_amount }  (reports.view) */
export async function liquidityScenario(req, res) {
  const { name, kind, delta_amount } = req.body || {};
  const KINDS = new Set(['RETIRO', 'COMPRA', 'INVERSION', 'INGRESO']);
  if (!KINDS.has(kind)) return res.status(400).json({ error: 'TIPO_INVALIDO' });
  if (!(Number(delta_amount) > 0)) return res.status(400).json({ error: 'MONTO_INVALIDO' });
  const result = await applyScenario({ name, kind, delta_amount, createdBy: req.user.id });
  await writeAudit({ userId: req.user.id, action: 'LIQUIDITY_SCENARIO', entity: 'liquidity_scenarios', entityId: null,
    severity: 'INFO', ip: req.ip, metadata: { kind, delta_amount } });
  res.status(201).json(result);
}

/** PUT /api/finance/liquidity/policy  Body: { min_buffer?, horizon_days?, sales_basis? }  (expenses.manage) */
export async function liquidityPolicy(req, res) {
  res.json(await setPolicy(req.body || {}));
}
