// ============================================================
// Seguimiento PÚBLICO de un pedido (sin login, sin PII). Lo consume el cliente
// con el número de orden impreso en su comprobante. Scope: business_day de HOY
// (el correlativo order_number se reinicia cada día).
// ============================================================
import { getDb } from '../db.js';
import { chileBusinessDay } from '../services/sales.js';

const STEPS = {
  PENDIENTE:      { label: 'Pedido recibido', step: 1 },
  EN_PREPARACION: { label: 'En preparación',  step: 2 },
  LISTO:          { label: 'Listo',           step: 3 },
  ENTREGADO:      { label: 'Entregado',        step: 4 },
};

/** GET /api/public/tracking/:order_number — estado del pedido de HOY. */
export async function getPublicTracking(req, res) {
  const n = Number(req.params.order_number);
  if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: 'ORDEN_INVALIDA' });
  const db = getDb();
  const day = chileBusinessDay();
  const r = (await db.execute({
    sql: `SELECT order_number, dispatch_status, status, created_at
          FROM sales WHERE business_day = ? AND order_number = ? LIMIT 1`,
    args: [day, n],
  })).rows[0];
  if (!r) return res.json({ found: false });
  if (r.status === 'ANULADA') {
    return res.json({ found: true, order_number: n, status: 'ANULADA', label: 'Pedido anulado', step: 0, total_steps: 4 });
  }
  const s = STEPS[r.dispatch_status] || STEPS.PENDIENTE;
  return res.json({ found: true, order_number: n, status: r.dispatch_status, label: s.label, step: s.step, total_steps: 4 });
}
