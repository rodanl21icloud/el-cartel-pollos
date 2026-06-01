// ============================================================
// Adiciones / Modificadores: grupos de opciones (presa, salsas, con/sin)
// y su asignación a productos. Las opciones pueden tener recargo (price_delta).
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

/** GET /api/modifiers — grupos con sus opciones y productos asignados. */
export async function listGroups(_req, res) {
  const db = getDb();
  const groups = (await db.execute({
    sql: `SELECT id, name, min_select, max_select, is_required FROM modifier_groups WHERE is_active = 1 ORDER BY name`,
    args: [],
  })).rows;
  const options = (await db.execute({
    sql: `SELECT id, group_id, name, price_delta FROM modifier_options WHERE is_active = 1 ORDER BY name`,
    args: [],
  })).rows;
  const links = (await db.execute({ sql: `SELECT product_id, group_id FROM product_modifier_groups`, args: [] })).rows;

  return res.json(groups.map((g) => ({
    id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select, is_required: !!g.is_required,
    options: options.filter((o) => o.group_id === g.id).map((o) => ({ id: o.id, name: o.name, price_delta: Number(o.price_delta) })),
    product_ids: links.filter((l) => l.group_id === g.id).map((l) => l.product_id),
  })));
}

/** POST /api/modifiers/groups  Body: { name, min_select?, max_select?, is_required? } */
export async function createGroup(req, res) {
  const { name, min_select = 0, max_select = 1, is_required = false } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'NOMBRE_REQUERIDO' });
  const db = getDb();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO modifier_groups (id, name, min_select, max_select, is_required) VALUES (?,?,?,?,?)`,
    args: [id, String(name).trim(), Number(min_select) || 0, Number(max_select) || 0, is_required ? 1 : 0],
  });
  await writeAudit({ userId: req.user.id, action: 'MODGROUP_CREATE', entity: 'modifier_groups', entityId: id, severity: 'INFO', ip: req.ip });
  return res.status(201).json({ id, name });
}

/** DELETE /api/modifiers/groups/:id */
export async function deleteGroup(req, res) {
  const db = getDb();
  await db.execute({ sql: `DELETE FROM modifier_groups WHERE id = ?`, args: [req.params.id] });
  await writeAudit({ userId: req.user.id, action: 'MODGROUP_DELETE', entity: 'modifier_groups', entityId: req.params.id, severity: 'WARN', ip: req.ip });
  return res.json({ deleted: true });
}

/** POST /api/modifiers/options  Body: { group_id, name, price_delta? } */
export async function createOption(req, res) {
  const { group_id, name, price_delta = 0 } = req.body || {};
  if (!group_id) return res.status(400).json({ error: 'GRUPO_REQUERIDO' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'NOMBRE_REQUERIDO' });
  if (typeof price_delta !== 'number' || price_delta < 0) return res.status(400).json({ error: 'RECARGO_INVALIDO' });
  const db = getDb();
  const g = await db.execute({ sql: `SELECT id FROM modifier_groups WHERE id = ?`, args: [group_id] });
  if (!g.rows.length) return res.status(404).json({ error: 'GRUPO_NO_ENCONTRADO' });
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO modifier_options (id, group_id, name, price_delta) VALUES (?,?,?,?)`,
    args: [id, group_id, String(name).trim(), price_delta],
  });
  return res.status(201).json({ id, group_id, name, price_delta });
}

/** DELETE /api/modifiers/options/:id */
export async function deleteOption(req, res) {
  const db = getDb();
  await db.execute({ sql: `DELETE FROM modifier_options WHERE id = ?`, args: [req.params.id] });
  return res.json({ deleted: true });
}

/** PUT /api/modifiers/groups/:id/products  Body: { product_ids: [] } — reasigna. */
export async function setGroupProducts(req, res) {
  const { id } = req.params;
  const { product_ids } = req.body || {};
  if (!Array.isArray(product_ids)) return res.status(400).json({ error: 'PRODUCTOS_INVALIDOS' });
  const db = getDb();
  const stmts = [{ sql: `DELETE FROM product_modifier_groups WHERE group_id = ?`, args: [id] }];
  for (const pid of [...new Set(product_ids)]) {
    stmts.push({ sql: `INSERT OR IGNORE INTO product_modifier_groups (product_id, group_id) VALUES (?,?)`, args: [pid, id] });
  }
  await db.batch(stmts, 'write');
  return res.json({ group_id: id, products: product_ids.length });
}

/** GET /api/products/:id/modifiers — grupos+opciones aplicables a un producto (POS). */
export async function getProductModifiers(req, res) {
  const db = getDb();
  const groups = (await db.execute({
    sql: `SELECT g.id, g.name, g.min_select, g.max_select, g.is_required
          FROM modifier_groups g JOIN product_modifier_groups pmg ON pmg.group_id = g.id
          WHERE pmg.product_id = ? AND g.is_active = 1 ORDER BY g.name`,
    args: [req.params.id],
  })).rows;
  if (!groups.length) return res.json([]);
  const ids = groups.map((g) => g.id);
  const opts = (await db.execute({
    sql: `SELECT id, group_id, name, price_delta FROM modifier_options
          WHERE is_active = 1 AND group_id IN (${ids.map(() => '?').join(',')}) ORDER BY name`,
    args: ids,
  })).rows;
  return res.json(groups.map((g) => ({
    id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select, is_required: !!g.is_required,
    options: opts.filter((o) => o.group_id === g.id).map((o) => ({ id: o.id, name: o.name, price_delta: Number(o.price_delta) })),
  })));
}
