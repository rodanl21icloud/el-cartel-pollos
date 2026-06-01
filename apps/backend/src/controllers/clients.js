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
