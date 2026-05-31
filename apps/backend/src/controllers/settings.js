// Datos del negocio para comprobantes (fila única id=1).
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

/** GET /api/settings — cualquier autenticado (se usa al imprimir). */
export async function getSettings(_req, res) {
  const db = getDb();
  const { rows } = await db.execute({ sql: `SELECT * FROM business_settings WHERE id = 1`, args: [] });
  return res.json(rows[0] || { id: 1, name: 'El Cartel de los Pollos', paper_width: 80 });
}

/** PUT /api/settings — permiso settings.manage. */
export async function updateSettings(req, res) {
  const { name, address, phone, rut, footer, paper_width } = req.body || {};
  if (name != null && !String(name).trim()) return res.status(400).json({ error: 'NOMBRE_REQUERIDO' });
  if (paper_width != null && ![58, 80].includes(Number(paper_width))) return res.status(400).json({ error: 'ANCHO_INVALIDO' });

  const db = getDb();
  const cur = (await db.execute({ sql: `SELECT * FROM business_settings WHERE id = 1`, args: [] })).rows[0] || {};
  const next = {
    name: name != null ? String(name).trim() : cur.name,
    address: address != null ? String(address).trim() : cur.address,
    phone: phone != null ? String(phone).trim() : cur.phone,
    rut: rut != null ? String(rut).trim() : cur.rut,
    footer: footer != null ? String(footer).trim() : cur.footer,
    paper_width: paper_width != null ? Number(paper_width) : (cur.paper_width || 80),
  };
  await db.execute({
    sql: `INSERT INTO business_settings (id, name, address, phone, rut, footer, paper_width, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, address=excluded.address, phone=excluded.phone,
            rut=excluded.rut, footer=excluded.footer, paper_width=excluded.paper_width,
            updated_at=excluded.updated_at`,
    args: [next.name, next.address, next.phone, next.rut, next.footer, next.paper_width],
  });
  await writeAudit({ userId: req.user.id, action: 'SETTINGS_UPDATE', entity: 'business_settings',
    severity: 'INFO', ip: req.ip });
  return res.json({ id: 1, ...next });
}
