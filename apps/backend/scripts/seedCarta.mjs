// Carga la carta real de El Cartel de los Pollos.
// Idempotente (upsert por SKU). Desactiva productos previos que no estén en la carta.
// Uso: npm run seed:carta
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/db.js';

const CARTA = [
  // categoría, nombre, precio
  ['POLLO', 'Cuarto de pollo tuto', 4000],
  ['POLLO', 'Cuarto de pollo pechuga', 4500],
  ['POLLO', 'Medio pollo', 8000],
  ['POLLO', 'Pollo entero', 14990],
  ['POLLO', 'Broaster porción', 4000],

  ['COMBOS', "Combo Pa'2 (salchipapas + 2 bebidas express)", 4490],
  ['COMBOS', 'Combo 1/2 pollo + papas 400', 11500],
  ['COMBOS', 'Combo pollo + papas 500', 18500],
  ['COMBOS', 'Combo pollo + papas 500g + bebida 1,5lt', 20500],
  ['COMBOS', 'Combo pollo + papas 1kl', 21500],
  ['COMBOS', 'Combo pollo + papas 1kl + bebida 1,5', 23500],
  ['COMBOS', 'Combo Banquete (entero + papas XL + bebida 1,5 + 6 empanaditas + 6 aros)', 26900],

  ['COLACIONES', 'Colación 1/4 pollo tuto', 5900],
  ['COLACIONES', 'Colación broaster', 5990],
  ['COLACIONES', 'Colación 1/4 pollo pechuga', 6400],
  ['COLACIONES', 'Menú E mechada', 4500],
  ['COLACIONES', 'Menú E pollo', 4500],

  ['PAPAS', 'Papa 150g', 1500],
  ['PAPAS', 'Papa 300g', 2900],
  ['PAPAS', 'Papa 400g', 3900],
  ['PAPAS', 'Papa 500g', 4800],
  ['PAPAS', 'Papa 900g', 7900],

  ['SNACKS', 'Sopaipillas (4 uds)', 1000],
  ['SNACKS', 'Aros de cebolla (6 uds)', 1500],
  ['SNACKS', 'Empanaditas (4 uds)', 1500],
  ['SNACKS', 'Tequeños (5 uds + 1 salsa)', 3000],
  ['SNACKS', 'Salchipapas', 3500],
  ['SNACKS', 'Canasta Mix (6 aros + 4 empanaditas + papas)', 3500],
  ['SNACKS', 'Salsa 1,5 oz (de la casa)', 300],

  ['BEBIDAS', 'Jugo caja', 500],
  ['BEBIDAS', 'Bebida express', 700],
  ['BEBIDAS', 'Bebida botella 250cc', 800],
  ['BEBIDAS', 'Bebida lata 220cc', 900],
  ['BEBIDAS', 'Bebida lata 350cc', 1200],
  ['BEBIDAS', 'Jugo boca ancha', 1200],
  ['BEBIDAS', 'Jumex', 1200],
  ['BEBIDAS', 'Score', 1400],
  ['BEBIDAS', 'Bebida bot. 591 ml', 1500],
  ['BEBIDAS', 'Powerade', 2000],
  ['BEBIDAS', 'Bebida 1.5 lt', 2500],
];

const db = getDb();

// SKU determinista por categoría (CAT-01) -> idempotencia y reproducibilidad.
const counters = {};
function skuFor(cat) {
  counters[cat] = (counters[cat] || 0) + 1;
  return `${cat.slice(0, 3)}-${String(counters[cat]).padStart(2, '0')}`;
}

const skus = CARTA.map(([cat]) => skuFor(cat));

// 1) Desactivar todo lo previo (se reactiva lo que esté en la carta).
await db.execute({ sql: `UPDATE products SET is_active = 0`, args: [] });

// 2) Upsert de cada producto por SKU.
let n = 0;
for (let i = 0; i < CARTA.length; i++) {
  const [cat, name, price] = CARTA[i];
  const sku = skus[i];
  await db.execute({
    sql: `INSERT INTO products (id, sku, name, price, category, is_active)
          VALUES (?,?,?,?,?,1)
          ON CONFLICT(sku) DO UPDATE SET
            name = excluded.name, price = excluded.price,
            category = excluded.category, is_active = 1, updated_at = datetime('now')`,
    args: [randomUUID(), sku, name, price, cat],
  });
  n++;
}

const active = await db.execute({ sql: `SELECT COUNT(*) AS c FROM products WHERE is_active = 1`, args: [] });
console.log(`Carta cargada: ${n} productos en ${new Set(CARTA.map((x) => x[0])).size} categorías.`);
console.log(`Productos activos en catálogo: ${active.rows[0].c}`);
