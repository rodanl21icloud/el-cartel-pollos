// Controlador de ventas. El payload ya viene verificado por HMAC (req.verifiedPayload).
import crypto from 'node:crypto';
import { registerSale } from '../services/sales.js';
import { canonicalize } from '../middleware/hmac.js';

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
    sql: `SELECT p.name, si.qty, si.unit_price, si.line_total, si.modifiers
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
      modifiers: i.modifiers ? JSON.parse(i.modifiers) : [],
    })),
  });
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
  if (q && /^\d+$/.test(q.trim())) { cl.push('s.order_number = ?'); args.push(Number(q.trim())); }
  const where = `WHERE ${cl.join(' AND ')}`;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { rows } = await db.execute({
    sql: `SELECT s.id, s.order_number, s.sold_at, s.business_day, s.total, s.payment_method, s.kind, s.dispatch_status,
                 c.name AS client_name,
                 (SELECT GROUP_CONCAT(p.name || ' x' || si.qty, ', ')
                  FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id) AS detalle
          FROM sales s LEFT JOIN clients c ON c.id = s.client_id
          ${where} ORDER BY s.sold_at DESC LIMIT ${limit}`,
    args,
  });
  return res.json(rows.map((r) => ({
    id: r.id, order_number: r.order_number, sold_at: r.sold_at, business_day: r.business_day,
    total: Number(r.total), payment_method: r.payment_method, kind: r.kind,
    dispatch_status: r.dispatch_status, client_name: r.client_name, detalle: r.detalle || '',
  })));
}

// Catálogo para la pantalla POS (productos activos).
export async function listProducts(req, res) {
  const { getDb } = await import('../db.js');
  const { rows } = await getDb().execute({
    sql: `SELECT p.id, p.sku, p.name, p.price, p.category, p.image_url,
                 (SELECT COUNT(*) FROM product_modifier_groups pmg WHERE pmg.product_id = p.id) AS mod_groups
          FROM products p WHERE p.is_active = 1 ORDER BY p.name`,
    args: [],
  });
  return res.json(rows.map((r) => ({
    id: r.id, sku: r.sku, name: r.name, price: Number(r.price), category: r.category,
    image_url: r.image_url, has_modifiers: Number(r.mod_groups) > 0,
  })));
}
