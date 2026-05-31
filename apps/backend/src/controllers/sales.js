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
    sql: `SELECT s.id, s.order_number, s.business_day, s.total, s.payment_method, s.sold_at,
                 s.dispatch_status, u.full_name AS cashier
          FROM sales s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    args: [req.params.id],
  });
  if (!sale.rows.length) return res.status(404).json({ error: 'VENTA_NO_ENCONTRADA' });

  const items = await db.execute({
    sql: `SELECT p.name, si.qty, si.unit_price, si.line_total
          FROM sale_items si JOIN products p ON p.id = si.product_id
          WHERE si.sale_id = ? ORDER BY p.name`,
    args: [req.params.id],
  });
  const s = sale.rows[0];
  return res.json({
    sale_id: s.id, order_number: s.order_number, business_day: s.business_day,
    total: Number(s.total), payment_method: s.payment_method, sold_at: s.sold_at,
    dispatch_status: s.dispatch_status, cashier: s.cashier,
    items: items.rows.map((i) => ({ name: i.name, qty: i.qty, unit_price: Number(i.unit_price), line_total: Number(i.line_total) })),
  });
}

// Catálogo para la pantalla POS (productos activos).
export async function listProducts(req, res) {
  const { getDb } = await import('../db.js');
  const { rows } = await getDb().execute({
    sql: `SELECT id, sku, name, price, category FROM products WHERE is_active = 1 ORDER BY name`,
    args: [],
  });
  return res.json(rows);
}
