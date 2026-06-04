// Controlador de ventas. El payload ya viene verificado por HMAC (req.verifiedPayload).
import crypto from 'node:crypto';
import { registerSale, chileBusinessDay } from '../services/sales.js';
import { canonicalize } from '../middleware/hmac.js';
import { writeAudit } from '../services/audit.js';

// Antigüedad máxima permitida para una venta retroactiva (días).
const BACKDATE_MAX_DIAS = 30;

export async function syncSale(req, res) {
  const payload = req.verifiedPayload;
  // Recalcula el hash canónico para persistirlo como huella de la venta.
  const payloadHash = crypto.createHash('sha256').update(canonicalize(payload)).digest('hex');

  try {
    const result = await registerSale(payload, {
      userId: req.user.id,
      payloadHash,
      syncedOffline: !!payload._offline,
      ip: req.ip,
    });
    const code = result.status === 'DUPLICATE' ? 200 : 201;
    return res.status(code).json({
      status: result.status,
      sale_id: result.saleId,
      client_uuid: payload.client_uuid,
      total: result.total,
      order_number: result.orderNumber, // N° de orden para despacho
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message, detail: err.detail });
  }
}

// POST /api/sales/backdate — registra una venta RETROACTIVA (fecha/hora pasada).
// Solo roles con permiso sales.backdate. No usa HMAC (acción de gerencia gated por
// permiso), pero queda fuertemente auditada y marcada como retroactiva.
export async function backdateSale(req, res) {
  const b = req.body || {};
  const reason = (b.reason || '').trim();
  const soldAt = b.sold_at;

  // Validaciones de la fecha declarada.
  const t = soldAt ? new Date(soldAt) : null;
  if (!t || isNaN(t.getTime())) return res.status(400).json({ error: 'FECHA_INVALIDA' });
  const ahora = Date.now();
  if (t.getTime() > ahora + 60_000) return res.status(400).json({ error: 'FECHA_FUTURA', detail: 'La fecha/hora no puede ser futura.' });
  const diasAtras = (ahora - t.getTime()) / 86_400_000;
  if (diasAtras > BACKDATE_MAX_DIAS) return res.status(400).json({ error: 'FECHA_DEMASIADO_ANTIGUA', detail: `Máximo ${BACKDATE_MAX_DIAS} días hacia atrás.` });
  if (!reason) return res.status(400).json({ error: 'MOTIVO_OBLIGATORIO' });

  // Construye el payload de venta (idéntico a una venta normal).
  const payload = {
    client_uuid: b.client_uuid || crypto.randomUUID(),
    payment_method: b.payment_method,
    sold_at: t.toISOString(),
    items: b.items,
    free_amount: b.free_amount,
    note: b.note,
    discount: b.discount,
    client: b.client,
  };
  const payloadHash = crypto.createHash('sha256').update(canonicalize(payload)).digest('hex');

  try {
    const result = await registerSale(payload, {
      userId: req.user.id,
      payloadHash,
      ip: req.ip,
      backdated: true,
      backdateReason: reason,
      businessDay: chileBusinessDay(t), // día hábil histórico (no el de hoy)
    });
    await writeAudit({
      userId: req.user.id, action: 'SALE_BACKDATE', entity: 'sales', entityId: result.saleId,
      severity: 'ALERT', ip: req.ip,
      metadata: { sold_at: t.toISOString(), registrado_at: new Date(ahora).toISOString(), total: result.total, payment_method: payload.payment_method, reason },
    });
    return res.status(201).json({
      status: result.status, sale_id: result.saleId, total: result.total,
      order_number: result.orderNumber, business_day: chileBusinessDay(t), backdated: true,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message, detail: err.detail });
  }
}

// GET /api/sales/:id/receipt — datos completos para imprimir/reenviar el comprobante.
export async function getReceipt(req, res) {
  const { getDb } = await import('../db.js');
  const db = getDb();
  const sale = await db.execute({
    sql: `SELECT s.id, s.order_number, s.business_day, s.total, s.subtotal, s.discount,
                 s.delivery_fee, s.delivery_address, s.payment_method, s.sold_at, s.dispatch_status,
                 u.full_name AS cashier, c.name AS client_name, c.phone AS client_phone
          FROM sales s JOIN users u ON u.id = s.user_id
          LEFT JOIN clients c ON c.id = s.client_id WHERE s.id = ?`,
    args: [req.params.id],
  });
  if (!sale.rows.length) return res.status(404).json({ error: 'VENTA_NO_ENCONTRADA' });

  const items = await db.execute({
    sql: `SELECT p.name, si.qty, si.unit_price, si.line_total, si.modifiers, si.note
          FROM sale_items si JOIN products p ON p.id = si.product_id
          WHERE si.sale_id = ? ORDER BY p.name`,
    args: [req.params.id],
  });
  const s = sale.rows[0];
  return res.json({
    sale_id: s.id, order_number: s.order_number, business_day: s.business_day,
    total: Number(s.total), subtotal: s.subtotal != null ? Number(s.subtotal) : null,
    discount: Number(s.discount || 0), delivery_fee: Number(s.delivery_fee || 0),
    delivery_address: s.delivery_address, client_name: s.client_name, client_phone: s.client_phone,
    payment_method: s.payment_method, sold_at: s.sold_at,
    dispatch_status: s.dispatch_status, cashier: s.cashier,
    items: items.rows.map((i) => ({
      name: i.name, qty: i.qty, unit_price: Number(i.unit_price), line_total: Number(i.line_total),
      modifiers: i.modifiers ? JSON.parse(i.modifiers) : [], note: i.note || null,
    })),
  });
}

// POST /api/sales/:id/void — anula una venta (la excluye de reportes) y, si
// descontó inventario por BOM, restaura el stock.
export async function voidSale(req, res) {
  const { getDb } = await import('../db.js');
  const { writeAudit } = await import('../services/audit.js');
  const db = getDb();
  const sale = (await db.execute({ sql: `SELECT id, status, order_number, total FROM sales WHERE id = ?`, args: [req.params.id] })).rows[0];
  if (!sale) return res.status(404).json({ error: 'VENTA_NO_ENCONTRADA' });
  if (sale.status === 'ANULADA') return res.json({ id: sale.id, status: 'ANULADA' });

  // Restaurar inventario de los descuentos BOM de esta venta y eliminarlos.
  const adj = (await db.execute({ sql: `SELECT id, ingredient_id, qty_delta FROM inventory_adjustments WHERE sale_id = ? AND type = 'VENTA'`, args: [req.params.id] })).rows;
  const stmts = [];
  for (const a of adj) {
    stmts.push({ sql: `UPDATE ingredients SET stock_qty = stock_qty - ?, updated_at = datetime('now') WHERE id = ?`, args: [a.qty_delta, a.ingredient_id] }); // qty_delta negativo → suma
    stmts.push({ sql: `DELETE FROM inventory_adjustments WHERE id = ?`, args: [a.id] });
  }
  stmts.push({ sql: `UPDATE sales SET status = 'ANULADA' WHERE id = ?`, args: [req.params.id] });
  stmts.push({
    sql: `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, severity, metadata, ip_address)
          VALUES (?,?, 'SALE_VOID', 'sales', ?, 'ALERT', ?, ?)`,
    args: [crypto.randomUUID(), req.user.id, req.params.id, JSON.stringify({ order_number: sale.order_number, total: Number(sale.total), reason: (req.body?.reason || '').slice(0, 200) }), req.ip || null],
  });
  await db.batch(stmts, 'write');
  return res.json({ id: sale.id, status: 'ANULADA', restored: adj.length });
}

// GET /api/sales?from=&to=&method=&q=&limit= — listado de ventas (transacciones).
export async function listSales(req, res) {
  const { getDb } = await import('../db.js');
  const db = getDb();
  const { from, to, method, q } = req.query;
  const cl = [`s.status = 'CONFIRMADA'`]; const args = [];
  if (from) { cl.push('s.sold_at >= ?'); args.push(from); }
  if (to) { cl.push('s.sold_at <= ?'); args.push(to); }
  if (method) { cl.push('s.payment_method = ?'); args.push(method); }
  if (q && q.trim()) {
    const t = q.trim(); const like = `%${t}%`;
    if (/^\d+$/.test(t)) { cl.push('(s.order_number = ? OR c.phone LIKE ? OR c.name LIKE ?)'); args.push(Number(t), like, like); }
    else { cl.push('(c.name LIKE ? OR c.phone LIKE ?)'); args.push(like, like); }
  }
  const where = `WHERE ${cl.join(' AND ')}`;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { rows } = await db.execute({
    sql: `SELECT s.id, s.order_number, s.sold_at, s.created_at, s.business_day, s.total, s.payment_method, s.kind, s.dispatch_status,
                 s.is_backdated, s.backdate_reason,
                 c.name AS client_name, c.phone AS client_phone,
                 (SELECT GROUP_CONCAT(p.name || ' x' || si.qty, ', ')
                  FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id) AS detalle
          FROM sales s LEFT JOIN clients c ON c.id = s.client_id
          ${where} ORDER BY s.sold_at DESC LIMIT ${limit}`,
    args,
  });
  return res.json(rows.map((r) => ({
    id: r.id, order_number: r.order_number, sold_at: r.sold_at, created_at: r.created_at, business_day: r.business_day,
    total: Number(r.total), payment_method: r.payment_method, kind: r.kind,
    dispatch_status: r.dispatch_status, client_name: r.client_name, client_phone: r.client_phone || null, detalle: r.detalle || '',
    is_backdated: !!r.is_backdated, backdate_reason: r.backdate_reason || null,
  })));
}

// Catálogo para la pantalla POS (productos activos).
export async function listProducts(req, res) {
  const { getDb } = await import('../db.js');
  const { rows } = await getDb().execute({
    sql: `SELECT p.id, p.sku, p.name, p.price, p.category, p.image_url,
                 (SELECT COUNT(*) FROM product_modifier_groups pmg WHERE pmg.product_id = p.id) AS mod_groups
          FROM products p WHERE p.is_active = 1 AND p.available = 1 ORDER BY p.name`,
    args: [],
  });
  return res.json(rows.map((r) => ({
    id: r.id, sku: r.sku, name: r.name, price: Number(r.price), category: r.category,
    image_url: r.image_url, has_modifiers: Number(r.mod_groups) > 0,
  })));
}
