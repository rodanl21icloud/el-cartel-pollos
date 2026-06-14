// ============================================================
// Catálogo público (sin autenticación). Lo consume la página compartible
// /catalogo/:slug. Expone solo datos de vitrina: negocio, formas de entrega
// y productos activos marcados como visibles en catálogo (in_catalog=1).
// NUNCA expone costos, recetas, stock ni nada sensible.
// ============================================================
import { getDb } from '../db.js';

const CAT_ORDER = ['POLLO', 'COMBOS', 'COLACIONES', 'PAPAS', 'SNACKS', 'BEBIDAS'];
const COMPLEMENT_CATS = ['PAPAS', 'BEBIDAS', 'SNACKS'];

// 2 complementos de mayor margen (costo BOM real; fallback products.cost).
// Devuelve SOLO nombre/precio/categoría — nunca costo ni margen.
async function highMarginComplements(db, limit = 2) {
  const ph = COMPLEMENT_CATS.map(() => '?').join(',');
  const rows = (await db.execute({
    sql: `SELECT p.name, p.price, p.category,
                 (p.price - COALESCE(
                    (SELECT SUM(pr.qty_per_unit * i.cost_unit)
                       FROM product_recipes pr JOIN ingredients i ON i.id = pr.ingredient_id
                      WHERE pr.product_id = p.id),
                    p.cost, 0)) AS margin
          FROM products p
          WHERE p.is_active = 1 AND p.in_catalog = 1 AND p.category IN (${ph})
          ORDER BY margin DESC, p.price ASC
          LIMIT ?`,
    args: [...COMPLEMENT_CATS, limit],
  })).rows;
  return rows.map((r) => ({ name: r.name, price: Number(r.price), category: r.category }));
}

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

  const upsell = await highMarginComplements(db, 2);

  return res.json({
    business: {
      name: bs.name,
      instagram: bs.instagram || null,
      phone: bs.phone || null,
      address: bs.address || null,
      whatsapp: bs.whatsapp || null,
      slug: bs.catalog_slug || slug,
      cartelera_theme: bs.cartelera_theme || null,
    },
    delivery: {
      pickup: bs.pickup_enabled == null ? true : !!bs.pickup_enabled,
      delivery: bs.delivery_enabled == null ? true : !!bs.delivery_enabled,
    },
    categories,
    upsell,
    count: prods.length,
  });
}
