// ============================================================
// Clientes (domicilios). Identificados por teléfono para autocompletar.
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';

const normPhone = (p) => String(p || '').replace(/[^\d+]/g, '');

/** GET /api/clients?phone=&q= — busca por teléfono exacto o nombre. */
export async function listClients(req, res) {
  const db = getDb();
  const { phone, q } = req.query;
  if (phone) {
    const { rows } = await db.execute({ sql: `SELECT * FROM clients WHERE phone = ? LIMIT 1`, args: [normPhone(phone)] });
    return res.json(rows[0] || null);
  }
  const term = `%${(q || '').trim()}%`;
  const { rows } = await db.execute({
    sql: `SELECT * FROM clients WHERE name LIKE ? OR phone LIKE ? ORDER BY updated_at DESC LIMIT 50`,
    args: [term, term],
  });
  return res.json(rows);
}

/** Upsert por teléfono. Devuelve el id. (uso interno + POST) */
export async function upsertClient(db, { phone, name, address, notes }) {
  const ph = normPhone(phone);
  if (!ph) return null;
  const ex = await db.execute({ sql: `SELECT id FROM clients WHERE phone = ?`, args: [ph] });
  if (ex.rows.length) {
    const id = ex.rows[0].id;
    await db.execute({
      sql: `UPDATE clients SET name = COALESCE(NULLIF(?,''), name),
              address = COALESCE(NULLIF(?,''), address), notes = COALESCE(NULLIF(?,''), notes),
              updated_at = datetime('now') WHERE id = ?`,
      args: [String(name || '').trim(), String(address || '').trim(), String(notes || '').trim(), id],
    });
    return id;
  }
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO clients (id, phone, name, address, notes) VALUES (?,?,?,?,?)`,
    args: [id, ph, String(name || 'Cliente').trim() || 'Cliente', String(address || '').trim() || null, String(notes || '').trim() || null],
  });
  return id;
}

/** GET /api/clients/:id/history — ficha + historial de compras del cliente. */
export async function clientHistory(req, res) {
  const db = getDb();
  const { id } = req.params;
  const client = (await db.execute({ sql: `SELECT * FROM clients WHERE id = ?`, args: [id] })).rows[0];
  if (!client) return res.status(404).json({ error: 'CLIENTE_NO_ENCONTRADO' });
  const st = (await db.execute({
    sql: `SELECT COUNT(*) n, COALESCE(SUM(total),0) total, MAX(sold_at) last
          FROM sales WHERE client_id = ? AND status='CONFIRMADA'`, args: [id],
  })).rows[0];
  const n = Number(st.n), tot = Number(st.total);
  const ventas = (await db.execute({
    sql: `SELECT s.order_number, s.sold_at, s.total, s.payment_method,
                 (SELECT GROUP_CONCAT(p.name || ' x' || si.qty, ', ') FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=s.id) detalle
          FROM sales s WHERE s.client_id = ? AND s.status='CONFIRMADA' ORDER BY s.sold_at DESC LIMIT 30`, args: [id],
  })).rows.map((r) => ({ order_number: r.order_number, sold_at: r.sold_at, total: Number(r.total), payment_method: r.payment_method, detalle: r.detalle || '' }));
  return res.json({ client, stats: { n, total: tot, ticket_prom: n ? Math.round(tot / n) : 0, last: st.last }, ventas });
}

/** POST /api/clients */
export async function createClient(req, res) {
  const { phone, name, address, notes } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'NOMBRE_REQUERIDO' });
  const db = getDb();
  const id = await upsertClient(db, { phone, name, address, notes });
  if (!id) return res.status(400).json({ error: 'TELEFONO_REQUERIDO' });
  const { rows } = await db.execute({ sql: `SELECT * FROM clients WHERE id = ?`, args: [id] });
  return res.status(201).json(rows[0]);
}
