// ============================================================
// Tablero de despacho: pedidos del día con su número de orden y estado.
// Estados: PENDIENTE -> EN_PREPARACION -> LISTO -> ENTREGADO.
// ============================================================
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';
import { chileBusinessDay } from '../services/sales.js';

const STATES = ['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO'];

/** GET /api/dispatch?day=YYYY-MM-DD — pedidos del día con detalle e estado. */
export async function listDispatch(req, res) {
  const db = getDb();
  const day = req.query.day || chileBusinessDay();

  const { rows } = await db.execute({
    sql: `SELECT s.id, s.order_number, s.dispatch_status, s.payment_method, s.total, s.sold_at,
                 s.kind, s.note, s.delivery_address,
                 (SELECT GROUP_CONCAT(p.name || ' x' || si.qty, ', ')
                  FROM sale_items si JOIN products p ON p.id = si.product_id
                  WHERE si.sale_id = s.id) AS detalle
          FROM sales s
          WHERE s.business_day = ? AND s.status = 'CONFIRMADA'
          ORDER BY s.order_number`,
    args: [day],
  });

  // Ítems por pedido (para el KDS: cantidad, nombre y modificadores).
  const itemsRes = await db.execute({
    sql: `SELECT si.sale_id, p.name, si.qty, si.modifiers
          FROM sale_items si JOIN products p ON p.id = si.product_id
          JOIN sales s ON s.id = si.sale_id
          WHERE s.business_day = ? AND s.status = 'CONFIRMADA'`,
    args: [day],
  });
  const itemsBySale = {};
  for (const it of itemsRes.rows) {
    (itemsBySale[it.sale_id] ||= []).push({ name: it.name, qty: Number(it.qty), modifiers: it.modifiers || null });
  }

  const orders = rows.map((r) => ({
    sale_id: r.id, order_number: r.order_number, status: r.dispatch_status,
    payment_method: r.payment_method, total: Number(r.total), sold_at: r.sold_at,
    kind: r.kind, note: r.note || null, delivery_address: r.delivery_address || null,
    detalle: r.detalle || '', items: itemsBySale[r.id] || [],
  }));
  // Resumen por estado.
  const counts = STATES.reduce((a, s) => { a[s] = orders.filter((o) => o.status === s).length; return a; }, {});
  return res.json({ day, counts, orders });
}

/** PUT /api/dispatch/:saleId/status  Body: { status } */
export async function updateDispatchStatus(req, res) {
  const { saleId } = req.params;
  const { status } = req.body || {};
  if (!STATES.includes(status)) return res.status(400).json({ error: 'ESTADO_INVALIDO' });

  const db = getDb();
  const cur = await db.execute({ sql: `SELECT id, order_number FROM sales WHERE id = ?`, args: [saleId] });
  if (!cur.rows.length) return res.status(404).json({ error: 'PEDIDO_NO_ENCONTRADO' });

  await db.execute({ sql: `UPDATE sales SET dispatch_status = ? WHERE id = ?`, args: [status, saleId] });
  await writeAudit({
    userId: req.user.id, action: 'DISPATCH_STATUS', entity: 'sales', entityId: saleId,
    severity: 'INFO', ip: req.ip, metadata: { order_number: cur.rows[0].order_number, status },
  });
  return res.json({ sale_id: saleId, status });
}
