// ============================================================
// Catálogo público (sin autenticación). Lo consume la página compartible
// /catalogo/:slug. Expone solo datos de vitrina: negocio, formas de entrega
// y productos activos marcados como visibles en catálogo (in_catalog=1).
// NUNCA expone costos, recetas, stock ni nada sensible.
// ============================================================
import { getDb } from '../db.js';

const CAT_ORDER = ['POLLO', 'COMBOS', 'COLACIONES', 'PAPAS', 'SNACKS', 'BEBIDAS'];

/** GET /api/public/catalog/:slug */
export async function getPublicCatalog(req, res) {
  const db = getDb();
  const slug = String(req.params.slug || '').toLowerCase();

  const bs = (await db.execute({ sql: `SELECT * FROM business_settings WHERE id = 1`, args: [] })).rows[0];
  if (!bs) return res.status(404).json({ error: 'CATALOGO_NO_ENCONTRADO' });

  // Si hay un slug configurado, debe coincidir (link único, estilo Treinta).
  if (bs.catalog_slug && String(bs.catalog_slug).toLowerCase() !== slug) {
    return res.status(404).json({ error: 'CATALOGO_NO_ENCONTRADO' });
  }

  const prods = (await db.execute({
    sql: `SELECT name, price, category, image_url, description
          FROM products WHERE is_active = 1 AND in_catalog = 1
          ORDER BY category, name`,
    args: [],
  })).rows;

  // Agrupar por categoría, respetando el orden de negocio.
  const byCat = new Map();
  for (const p of prods) {
    const c = p.category || 'OTROS';
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push({
      name: p.name, price: Number(p.price), image_url: p.image_url || null,
      description: p.description || null,
    });
  }
  const order = (c) => { const i = CAT_ORDER.indexOf(c); return i === -1 ? 99 : i; };
  const categories = [...byCat.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
    .map(([name, items]) => ({ name, items }));

  return res.json({
    business: {
      name: bs.name,
      instagram: bs.instagram || null,
      phone: bs.phone || null,
      address: bs.address || null,
      whatsapp: bs.whatsapp || null,
      slug: bs.catalog_slug || slug,
    },
    delivery: {
      pickup: bs.pickup_enabled == null ? true : !!bs.pickup_enabled,
      delivery: bs.delivery_enabled == null ? true : !!bs.delivery_enabled,
    },
    categories,
    count: prods.length,
  });
}
