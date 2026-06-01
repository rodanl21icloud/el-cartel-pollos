// Insumos base + recetas (BOM) para la carta real.
// ESTIMACIONES de costo y cantidad como punto de partida: ajústalas en la app.
// Idempotente: no pisa el stock existente; reescribe recetas por producto.
// Uso: npm run seed:recetas
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/db.js';

const db = getDb();
const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// --- Insumos: [nombre, unidad, costo_unitario_estimado] ---
// Reutiliza Pollo / Papas Scarsofy / Empaque Combo que ya existen.
const INSUMOS = [
  ['Pollo', 'unidad', 3500],
  ['Papas Scarsofy', 'gramo', 2],
  ['Empaque Combo', 'empaque', 150],
  ['Bolsa delivery', 'unidad', 90],
  ['Aceite freidora', 'mililitro', 2.5],
  ['Mechada', 'gramo', 9],
  ['Acompañamiento (arroz/ensalada)', 'gramo', 1.5],
  ['Empanadita', 'unidad', 220],
  ['Aro de cebolla', 'unidad', 110],
  ['Sopaipilla', 'unidad', 90],
  ['Tequeño', 'unidad', 230],
  ['Salsa de la casa', 'unidad', 80],
  ['Salchicha', 'unidad', 300],
  // Bebidas (reventa, 1:1)
  ['Insumo Bebida express', 'unidad', 350],
  ['Insumo Bebida 1.5 lt', 'unidad', 1200],
  ['Insumo Bebida lata 350cc', 'unidad', 600],
  ['Insumo Bebida lata 220cc', 'unidad', 450],
  ['Insumo Bebida botella 250cc', 'unidad', 400],
  ['Insumo Bebida bot. 591 ml', 'unidad', 800],
  ['Insumo Jugo caja', 'unidad', 250],
  ['Insumo Jugo boca ancha', 'unidad', 600],
  ['Insumo Jumex', 'unidad', 600],
  ['Insumo Score', 'unidad', 700],
  ['Insumo Powerade', 'unidad', 1000],
];

// Stock inicial por unidad (solo al crear; no se pisa en re-ejecución).
function initialStock(unit) {
  if (unit === 'gramo') return { stock: 50000, min: 8000 };
  if (unit === 'mililitro') return { stock: 20000, min: 3000 };
  return { stock: 200, min: 30 };
}

// --- Recetas: nombre de producto -> [[insumo, cantidad], ...] (decimales OK) ---
const RECETAS = {
  // POLLO
  'Cuarto de pollo tuto': [['Pollo', 0.25], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Cuarto de pollo pechuga': [['Pollo', 0.25], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Medio pollo': [['Pollo', 0.5], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Pollo entero': [['Pollo', 1], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Broaster porción': [['Pollo', 0.25], ['Aceite freidora', 50], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  // PAPAS
  'Papa 150g': [['Papas Scarsofy', 150], ['Aceite freidora', 20], ['Empaque Combo', 1]],
  'Papa 300g': [['Papas Scarsofy', 300], ['Aceite freidora', 30], ['Empaque Combo', 1]],
  'Papa 400g': [['Papas Scarsofy', 400], ['Aceite freidora', 40], ['Empaque Combo', 1]],
  'Papa 500g': [['Papas Scarsofy', 500], ['Aceite freidora', 50], ['Empaque Combo', 1]],
  'Papa 900g': [['Papas Scarsofy', 900], ['Aceite freidora', 80], ['Empaque Combo', 1]],
  // COMBOS
  "Combo Pa'2 (salchipapas + 2 bebidas express)": [['Salchicha', 2], ['Papas Scarsofy', 300], ['Aceite freidora', 40], ['Insumo Bebida express', 2], ['Empaque Combo', 1]],
  'Combo 1/2 pollo + papas 400': [['Pollo', 0.5], ['Papas Scarsofy', 400], ['Aceite freidora', 40], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Combo pollo + papas 500': [['Pollo', 1], ['Papas Scarsofy', 500], ['Aceite freidora', 50], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Combo pollo + papas 500g + bebida 1,5lt': [['Pollo', 1], ['Papas Scarsofy', 500], ['Aceite freidora', 50], ['Insumo Bebida 1.5 lt', 1], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Combo pollo + papas 1kl': [['Pollo', 1], ['Papas Scarsofy', 1000], ['Aceite freidora', 90], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Combo pollo + papas 1kl + bebida 1,5': [['Pollo', 1], ['Papas Scarsofy', 1000], ['Aceite freidora', 90], ['Insumo Bebida 1.5 lt', 1], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Combo Banquete (entero + papas XL + bebida 1,5 + 6 empanaditas + 6 aros)': [['Pollo', 1], ['Papas Scarsofy', 1000], ['Insumo Bebida 1.5 lt', 1], ['Empanadita', 6], ['Aro de cebolla', 6], ['Aceite freidora', 120], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  // COLACIONES
  'Colación 1/4 pollo tuto': [['Pollo', 0.25], ['Papas Scarsofy', 250], ['Aceite freidora', 30], ['Insumo Bebida express', 1], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Colación broaster': [['Pollo', 0.25], ['Papas Scarsofy', 250], ['Aceite freidora', 60], ['Insumo Bebida express', 1], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Colación 1/4 pollo pechuga': [['Pollo', 0.25], ['Papas Scarsofy', 250], ['Aceite freidora', 30], ['Insumo Bebida express', 1], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Menú E mechada': [['Mechada', 150], ['Acompañamiento (arroz/ensalada)', 200], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  'Menú E pollo': [['Pollo', 0.25], ['Acompañamiento (arroz/ensalada)', 200], ['Empaque Combo', 1], ['Bolsa delivery', 1]],
  // SNACKS
  'Sopaipillas (4 uds)': [['Sopaipilla', 4], ['Aceite freidora', 30], ['Empaque Combo', 1]],
  'Aros de cebolla (6 uds)': [['Aro de cebolla', 6], ['Aceite freidora', 40], ['Empaque Combo', 1]],
  'Empanaditas (4 uds)': [['Empanadita', 4], ['Aceite freidora', 30], ['Empaque Combo', 1]],
  'Tequeños (5 uds + 1 salsa)': [['Tequeño', 5], ['Salsa de la casa', 1], ['Aceite freidora', 40], ['Empaque Combo', 1]],
  'Salchipapas': [['Salchicha', 2], ['Papas Scarsofy', 300], ['Aceite freidora', 40], ['Empaque Combo', 1]],
  'Canasta Mix (6 aros + 4 empanaditas + papas)': [['Aro de cebolla', 6], ['Empanadita', 4], ['Papas Scarsofy', 200], ['Aceite freidora', 60], ['Empaque Combo', 1]],
  'Salsa 1,5 oz (de la casa)': [['Salsa de la casa', 1]],
  // BEBIDAS (reventa 1:1)
  'Jugo caja': [['Insumo Jugo caja', 1]],
  'Bebida express': [['Insumo Bebida express', 1]],
  'Bebida botella 250cc': [['Insumo Bebida botella 250cc', 1]],
  'Bebida lata 220cc': [['Insumo Bebida lata 220cc', 1]],
  'Bebida lata 350cc': [['Insumo Bebida lata 350cc', 1]],
  'Jugo boca ancha': [['Insumo Jugo boca ancha', 1]],
  'Jumex': [['Insumo Jumex', 1]],
  'Score': [['Insumo Score', 1]],
  'Bebida bot. 591 ml': [['Insumo Bebida bot. 591 ml', 1]],
  'Powerade': [['Insumo Powerade', 1]],
  'Bebida 1.5 lt': [['Insumo Bebida 1.5 lt', 1]],
};

// 1) Upsert de insumos (sin pisar stock existente).
for (const [name, unit, cost] of INSUMOS) {
  const { stock, min } = initialStock(unit);
  await db.execute({
    sql: `INSERT INTO ingredients (id, name, unit, stock_qty, min_stock_qty, cost_unit)
          VALUES (?,?,?,?,?,?)
          ON CONFLICT(name) DO UPDATE SET unit = excluded.unit, cost_unit = excluded.cost_unit,
            is_active = 1, updated_at = datetime('now')`,
    args: [randomUUID(), name, unit, stock, min, cost],
  });
}

// Mapa nombre->{id,cost,unit}
const ingRows = (await db.execute({ sql: `SELECT id, name, cost_unit, unit FROM ingredients`, args: [] })).rows;
const ing = new Map(ingRows.map((r) => [r.name, { id: r.id, cost: Number(r.cost_unit), unit: r.unit }]));

// 2) Reescribir recetas por producto + calcular food cost.
let okCount = 0;
const resumen = [];
for (const [prodName, lines] of Object.entries(RECETAS)) {
  const prod = (await db.execute({ sql: `SELECT id, price FROM products WHERE name = ? AND is_active = 1`, args: [prodName] })).rows[0];
  if (!prod) { console.log('⚠ producto no encontrado:', prodName); continue; }

  const stmts = [{ sql: `DELETE FROM product_recipes WHERE product_id = ?`, args: [prod.id] }];
  let costo = 0;
  for (const [insumoName, qty] of lines) {
    const it = ing.get(insumoName);
    if (!it) { console.log('⚠ insumo no encontrado:', insumoName, 'en', prodName); continue; }
    costo += qty * it.cost;
    stmts.push({
      sql: `INSERT INTO product_recipes (id, product_id, ingredient_id, qty_per_unit) VALUES (?,?,?,?)`,
      args: [randomUUID(), prod.id, it.id, qty],
    });
  }
  await db.batch(stmts, 'write');
  okCount++;
  const price = Number(prod.price);
  resumen.push({ prodName, price, costo, fc: price > 0 ? Math.round((costo / price) * 100) : 0 });
}

console.log(`\nInsumos: ${INSUMOS.length} · Recetas escritas: ${okCount}/${Object.keys(RECETAS).length}\n`);
console.log('Producto'.padEnd(46), 'Precio'.padStart(9), 'Costo'.padStart(9), 'FoodCost');
for (const r of resumen.sort((a, b) => b.fc - a.fc)) {
  console.log(r.prodName.slice(0, 45).padEnd(46), money(r.price).padStart(9), money(Math.round(r.costo)).padStart(9), (r.fc + '%').padStart(8));
}
console.log('\n(*) Costos y cantidades son ESTIMACIONES iniciales. Ajusta en Inventario y Carta.');
