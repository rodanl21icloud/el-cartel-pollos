// Controllers del módulo Comercial/Marketing. Lógica en services/marketing/commercial.
import {
  dashboard, customers, reports, listCampaigns, createCampaign, updateCampaign,
  loyaltyOverview, loyaltyMove,
} from '../services/marketing/commercial.js';
import { draftWinbacks } from '../services/marketing/winback.js';
import { writeAudit } from '../services/audit.js';

const range = (q) => ({ from: q.from || null, to: q.to || null });

/** GET /api/marketing/winback — borradores de recuperación de clientes dormidos. */
export async function mktWinback(req, res) {
  const { min_days, max_days, limit } = req.query;
  const out = await draftWinbacks({
    minDays: Number(min_days) || 15, maxDays: Number(max_days) || 60, limit: Number(limit) || 50,
  });
  return res.json(out);
}

export async function mktDashboard(req, res) { res.json(await dashboard(range(req.query))); }
export async function mktCustomers(req, res) { res.json(await customers({ segment: req.query.segment || null })); }
export async function mktReports(req, res) { res.json(await reports(range(req.query))); }

export async function mktCampaigns(_req, res) { res.json(await listCampaigns()); }
export async function mktCreateCampaign(req, res) {
  if (!req.body?.name?.trim()) return res.status(400).json({ error: 'NOMBRE_REQUERIDO' });
  const c = await createCampaign(req.body, req.user.id);
  await writeAudit({ userId: req.user.id, action: 'CAMPAIGN_CREATE', entity: 'campaigns', entityId: c.id, severity: 'INFO', ip: req.ip });
  res.status(201).json(c);
}
export async function mktUpdateCampaign(req, res) {
  const c = await updateCampaign(req.params.id, req.body || {});
  if (!c) return res.status(404).json({ error: 'CAMPANA_NO_ENCONTRADA' });
  res.json(c);
}

export async function mktLoyalty(_req, res) { res.json(await loyaltyOverview()); }
export async function mktLoyaltyMove(req, res) {
  const { type, points, reason } = req.body || {};
  if (!['EARN', 'REDEEM', 'ADJUST'].includes(type)) return res.status(400).json({ error: 'TIPO_INVALIDO' });
  if (!(Number(points) > 0)) return res.status(400).json({ error: 'PUNTOS_INVALIDOS' });
  const r = await loyaltyMove({ clientId: req.params.clientId, type, points: Number(points), reason, userId: req.user.id });
  if (!r) return res.status(404).json({ error: 'CLIENTE_NO_ENCONTRADO' });
  res.json(r);
}
