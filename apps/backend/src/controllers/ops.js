// Controllers del Centro de Operaciones Diario. Lógica en services/ops/operations.
import {
  dashboard, evaluateAlerts, getChecklist, updateChecklistItem, criticalInventory,
  listTasks, upsertTask, updateTask, openDay, closeDay, todayCl,
} from '../services/ops/operations.js';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

const dayOf = (q) => (/^\d{4}-\d{2}-\d{2}$/.test(q.date || '') ? q.date : todayCl());

/** GET /api/ops/today?date= */
export async function opsToday(req, res) { res.json(await dashboard(dayOf(req.query))); }

/** POST /api/ops/today/evaluate?date= — corre el motor de alertas. */
export async function opsEvaluate(req, res) { res.json(await evaluateAlerts(dayOf(req.query), req.user.id)); }

/** GET /api/ops/checklist?date=&phase=APERTURA|CIERRE */
export async function opsChecklist(req, res) {
  const phase = req.query.phase === 'CIERRE' ? 'CIERRE' : 'APERTURA';
  res.json({ day: dayOf(req.query), phase, items: await getChecklist(dayOf(req.query), phase) });
}

/** POST /api/ops/checklist/:id  Body: { status, note, responsible_id } */
export async function opsChecklistUpdate(req, res) {
  const { status, note, responsible_id } = req.body || {};
  if (status && !['PENDIENTE', 'SI', 'NO', 'NA'].includes(status)) return res.status(400).json({ error: 'ESTADO_INVALIDO' });
  const items = await updateChecklistItem(req.params.id, { status, note, responsibleId: responsible_id, userId: req.user.id });
  if (!items) return res.status(404).json({ error: 'ITEM_NO_ENCONTRADO' });
  res.json({ items });
}

/** GET /api/ops/critical-inventory */
export async function opsCriticalInventory(_req, res) { res.json(await criticalInventory()); }

/** POST /api/ops/day/open?date= */
export async function opsOpenDay(req, res) {
  const day = dayOf(req.query);
  await writeAudit({ userId: req.user.id, action: 'OPS_DAY_OPEN', entity: 'operational_day', entityId: day, severity: 'INFO', ip: req.ip });
  res.json(await openDay(day, req.user.id));
}

/** POST /api/ops/day/close?date=  Body: { notes } */
export async function opsCloseDay(req, res) {
  const day = dayOf(req.query);
  const r = await closeDay(day, req.user.id, { notes: req.body?.notes });
  if (r.error) return res.status(409).json(r);
  await writeAudit({ userId: req.user.id, action: 'OPS_DAY_CLOSE', entity: 'operational_day', entityId: day, severity: 'INFO', ip: req.ip });
  res.json(r);
}

/** GET /api/ops/tasks?date=&status= */
export async function opsTasks(req, res) {
  res.json(await listTasks({ day: req.query.date || null, status: req.query.status || null }));
}

/** POST /api/ops/tasks  Body: { title, description, priority, responsible_id, due_date, day } */
export async function opsCreateTask(req, res) {
  const { title, description, priority, responsible_id, due_date, day } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'TITULO_REQUERIDO' });
  const id = await upsertTask(getDb(), {
    day: day || todayCl(), kind: 'TAREA', title: String(title).trim(), description,
    priority: priority || 'media', responsibleId: responsible_id, due_date, source_type: 'MANUAL', createdBy: req.user.id,
  });
  res.status(201).json({ id });
}

/** PATCH /api/ops/tasks/:id  Body: campos a actualizar (status, resolution, etc.) */
export async function opsUpdateTask(req, res) {
  const body = req.body || {};
  if (body.status && !['pendiente', 'en_proceso', 'resuelta', 'descartada'].includes(body.status)) return res.status(400).json({ error: 'ESTADO_INVALIDO' });
  const t = await updateTask(req.params.id, body, req.user.id);
  if (!t) return res.status(404).json({ error: 'TAREA_NO_ENCONTRADA' });
  res.json(t);
}

/** GET /api/ops/config  ·  PUT /api/ops/config */
export async function opsGetConfig(_req, res) {
  const rows = (await getDb().execute(`SELECT key, value FROM ops_config`)).rows;
  res.json(Object.fromEntries(rows.map((r) => [r.key, Number(r.value)])));
}
export async function opsSetConfig(req, res) {
  const db = getDb();
  const allowed = ['daily_sales_target', 'ticket_target', 'waste_threshold_clp', 'cash_diff_tolerance', 'labor_pct_target'];
  const entries = Object.entries(req.body || {}).filter(([k]) => allowed.includes(k));
  if (!entries.length) return res.status(400).json({ error: 'SIN_CAMBIOS' });
  for (const [k, v] of entries) await db.execute({ sql: `INSERT INTO ops_config (key,value,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')`, args: [k, String(v)] });
  const rows = (await db.execute(`SELECT key, value FROM ops_config`)).rows;
  res.json(Object.fromEntries(rows.map((r) => [r.key, Number(r.value)])));
}
