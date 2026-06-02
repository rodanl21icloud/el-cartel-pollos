// Datos del negocio para comprobantes (fila única id=1).
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

/** GET /api/settings — cualquier autenticado (se usa al imprimir). */
export async function getSettings(_req, res) {
  const db = getDb();
  const { rows } = await db.execute({ sql: `SELECT * FROM business_settings WHERE id = 1`, args: [] });
  return res.json(rows[0] || { id: 1, name: 'El Cartel de los Pollos', paper_width: 80 });
}

// Normaliza un slug de catálogo: minúsculas, sin tildes, solo a-z0-9 y guiones.
function normSlug(s) {
  return String(s).toLowerCase().trim()
    .replace(/^@/, '').replace(/\.cl$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** PUT /api/settings — permiso settings.manage. */
export async function updateSettings(req, res) {
  const { name, address, phone, rut, footer, paper_width,
          catalog_slug, whatsapp, pickup_enabled, delivery_enabled } = req.body || {};
  if (name != null && !String(name).trim()) return res.status(400).json({ error: 'NOMBRE_REQUERIDO' });
  if (paper_width != null && ![58, 80].includes(Number(paper_width))) return res.status(400).json({ error: 'ANCHO_INVALIDO' });
  if (catalog_slug != null && normSlug(catalog_slug).length < 3) return res.status(400).json({ error: 'SLUG_INVALIDO' });

  const db = getDb();
  const cur = (await db.execute({ sql: `SELECT * FROM business_settings WHERE id = 1`, args: [] })).rows[0] || {};
  const bool = (v, d) => (v == null ? (d == null ? 1 : (d ? 1 : 0)) : (v ? 1 : 0));
  const next = {
    name: name != null ? String(name).trim() : cur.name,
    address: address != null ? String(address).trim() : cur.address,
    phone: phone != null ? String(phone).trim() : cur.phone,
    rut: rut != null ? String(rut).trim() : cur.rut,
    footer: footer != null ? String(footer).trim() : cur.footer,
    paper_width: paper_width != null ? Number(paper_width) : (cur.paper_width || 80),
    catalog_slug: catalog_slug != null ? normSlug(catalog_slug) : (cur.catalog_slug || null),
    whatsapp: whatsapp != null ? String(whatsapp).replace(/[^\d+]/g, '') || null : (cur.whatsapp || null),
    pickup_enabled: bool(pickup_enabled, cur.pickup_enabled),
    delivery_enabled: bool(delivery_enabled, cur.delivery_enabled),
  };
  await db.execute({
    sql: `INSERT INTO business_settings
            (id, name, address, phone, rut, footer, paper_width, catalog_slug, whatsapp, pickup_enabled, delivery_enabled, updated_at)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, address=excluded.address, phone=excluded.phone,
            rut=excluded.rut, footer=excluded.footer, paper_width=excluded.paper_width,
            catalog_slug=excluded.catalog_slug, whatsapp=excluded.whatsapp,
            pickup_enabled=excluded.pickup_enabled, delivery_enabled=excluded.delivery_enabled,
            updated_at=excluded.updated_at`,
    args: [next.name, next.address, next.phone, next.rut, next.footer, next.paper_width,
           next.catalog_slug, next.whatsapp, next.pickup_enabled, next.delivery_enabled],
  });
  await writeAudit({ userId: req.user.id, action: 'SETTINGS_UPDATE', entity: 'business_settings',
    severity: 'INFO', ip: req.ip });
  return res.json({ id: 1, ...next });
}
