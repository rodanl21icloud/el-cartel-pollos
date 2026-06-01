// Set base de insumos + recetas (BOM) para la carta REAL (42 productos Treinta).
// Costos y cantidades son ESTIMACIONES iniciales: ajústalas en Inventario/Carta.
// Idempotente. Uso: node --env-file=.env scripts/seedRecetasReal.mjs
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/db.js';

const db = getDb();
const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// --- Insumos: [nombre, unidad, costo estimado] ---
const INSUMOS = [
  ['Pollo', 'unidad', 3500],
  ['Papas prefritas', 'gramo', 2.2],
  ['Aceite freidora', 'mililitro', 2.5],
  ['Empaque', 'unidad', 150],
  ['Bolsa delivery', 'unidad', 90],
  ['Mechada', 'gramo', 9],
  ['Queso', 'gramo', 8],
  ['Masa empanada', 'unidad', 180],
  ['Acompañamiento (arroz/ensalada)', 'gramo', 1.5],
  ['Aro de cebolla', 'unidad', 110],
  ['Sopaipilla', 'unidad', 90],
  ['Tequeño', 'unidad', 230],
  ['Salsa de la casa', 'unidad', 80],
  ['Salchicha', 'unidad', 300],
  // Bebidas (reventa 1:1)
  ['Ins. Bebida express', 'unidad', 350],
  ['Ins. Bebida 1.5L', 'unidad', 1200],
  ['Ins. Bebida 1L', 'unidad', 900],
  ['Ins. Bebida lata 350cc', 'unidad', 600],
  ['Ins. Bebida bot. 591ml', 'unidad', 800],
  ['Ins. Agua mineral', 'unidad', 350],
  ['Ins. Jugo caja', 'unidad', 250],
  ['Ins. Score', 'unidad', 700],
  ['Ins. Coca 1.25L', 'unidad', 800],
  ['Ins. UPBEB125', 'unidad', 500],
];
const stk = (u) => u === 'gramo' ? { s: 50000, m: 8000 } : u === 'mililitro' ? { s: 30000, m: 5000 } : { s: 200, m: 30 };

// --- Recetas: nombre EXACTO de producto -> [[insumo, cantidad], ...] ---
const R = {
  // POLLO
  'POLLO ENTERO': [['Pollo', 1], ['Empaque', 1], ['Bolsa delivery', 1]],
  'MEDIO POLLO': [['Pollo', 0.5], ['Empaque', 1], ['Bolsa delivery', 1]],
  'CUARTO DE POLLO PECHUGA': [['Pollo', 0.25], ['Empaque', 1], ['Bolsa delivery', 1]],
  'CUARTO DE POLLO TUTO': [['Pollo', 0.25], ['Empaque', 1], ['Bolsa delivery', 1]],
  'BROASTER PORCIÓN': [['Pollo', 0.25], ['Aceite freidora', 50], ['Empaque', 1], ['Bolsa delivery', 1]],
  // PAPAS
  'PAPA 150g': [['Papas prefritas', 150], ['Aceite freidora', 20], ['Empaque', 1]],
  'PAPA 300g': [['Papas prefritas', 300], ['Aceite freidora', 30], ['Empaque', 1]],
  'PAPA 400g': [['Papas prefritas', 400], ['Aceite freidora', 40], ['Empaque', 1]],
  'PAPA 500G': [['Papas prefritas', 500], ['Aceite freidora', 50], ['Empaque', 1]],
  'PAPA 900g': [['Papas prefritas', 900], ['Aceite freidora', 80], ['Empaque', 1]],
  'SALCHIPAPAS': [['Salchicha', 2], ['Papas prefritas', 300], ['Aceite freidora', 40], ['Empaque', 1]],
  // COMBOS
  'COMBO 1/2 POLLO + PAPAS 400': [['Pollo', 0.5], ['Papas prefritas', 400], ['Aceite freidora', 40], ['Empaque', 1], ['Bolsa delivery', 1]],
  'COMBO POLLO + PAPAS 500': [['Pollo', 1], ['Papas prefritas', 500], ['Aceite freidora', 50], ['Empaque', 1], ['Bolsa delivery', 1]],
  'COMBO POLLO + PAPAS 500G + BEBIDA 1,5LT': [['Pollo', 1], ['Papas prefritas', 500], ['Aceite freidora', 50], ['Ins. Bebida 1.5L', 1], ['Empaque', 1], ['Bolsa delivery', 1]],
  'COMBO POLLO + PAPAS 900': [['Pollo', 1], ['Papas prefritas', 900], ['Aceite freidora', 80], ['Empaque', 1], ['Bolsa delivery', 1]],
  'COMBO POLLO + PAPAS 1KL': [['Pollo', 1], ['Papas prefritas', 1000], ['Aceite freidora', 90], ['Empaque', 1], ['Bolsa delivery', 1]],
  'COMBO POLLO + PAPAS 900 + BEBIDA 1,5': [['Pollo', 1], ['Papas prefritas', 900], ['Aceite freidora', 80], ['Ins. Bebida 1.5L', 1], ['Empaque', 1], ['Bolsa delivery', 1]],
  "COMBO PA'2": [['Salchicha', 2], ['Papas prefritas', 300], ['Aceite freidora', 40], ['Ins. Bebida express', 2], ['Empaque', 1]],
  // COLACIONES
  'COLACIÓN 1/4 DE POLLO PECHUGA': [['Pollo', 0.25], ['Papas prefritas', 250], ['Aceite freidora', 30], ['Ins. Bebida express', 1], ['Empaque', 1], ['Bolsa delivery', 1]],
  'COLACIÓN 1/4 DE POLLO TUTO': [['Pollo', 0.25], ['Papas prefritas', 250], ['Aceite freidora', 30], ['Ins. Bebida express', 1], ['Empaque', 1], ['Bolsa delivery', 1]],
  'COLACIÓN BROASTER': [['Pollo', 0.25], ['Papas prefritas', 250], ['Aceite freidora', 60], ['Ins. Bebida express', 1], ['Empaque', 1], ['Bolsa delivery', 1]],
  'MENÚ E MECHADA': [['Mechada', 150], ['Acompañamiento (arroz/ensalada)', 200], ['Empaque', 1], ['Bolsa delivery', 1]],
  // SNACKS
  'AROS DE CEBOLLA 6uds': [['Aro de cebolla', 6], ['Aceite freidora', 40], ['Empaque', 1]],
  'EMPANADITAS 4uds': [['Masa empanada', 4], ['Aceite freidora', 30], ['Empaque', 1]],
  'EMPANADA MECHADA QUESO.': [['Masa empanada', 1], ['Mechada', 60], ['Queso', 30], ['Aceite freidora', 20], ['Empaque', 1]],
  'SOPAIPILLAS 4uds': [['Sopaipilla', 4], ['Aceite freidora', 30], ['Empaque', 1]],
  'TEQUEÑOS 5 und. + 1 SALSA': [['Tequeño', 5], ['Salsa de la casa', 1], ['Aceite freidora', 40], ['Empaque', 1]],
  'CANASTA MIX': [['Aro de cebolla', 6], ['Masa empanada', 4], ['Papas prefritas', 200], ['Aceite freidora', 60], ['Empaque', 1]],
  'Salsa 1,5 0Z': [['Salsa de la casa', 1]],
  // BEBIDAS (reventa 1:1)
  'BEBIDA EXPRESS': [['Ins. Bebida express', 1]],
  'BEBIDA 1.5LT': [['Ins. Bebida 1.5L', 1]],
  'BEBIDA 1L DESECHABLE': [['Ins. Bebida 1L', 1]],
  'Bebida 1L': [['Ins. Bebida 1L', 1]],
  'BEBIDA BOT. 591 ML': [['Ins. Bebida bot. 591ml', 1]],
  'BEBIDA LATA 350cc': [['Ins. Bebida lata 350cc', 1]],
  'AGUA MINERAL CON GAS': [['Ins. Agua mineral', 1]],
  'AGUA MINERAL SIN GAS': [['Ins. Agua mineral', 1]],
  'JUGO CAJA': [['Ins. Jugo caja', 1]],
  'SCORE': [['Ins. Score', 1]],
  'COCA COLA 1.25L VIDRIO': [['Ins. Coca 1.25L', 1]],
  '.UPBEB125': [['Ins. UPBEB125', 1]],
  // 'Delivery 2000 Base' -> sin receta (es un cargo de envío)
};

// 1) Limpiar insumos previos (los de prueba) y crear el set base.
await db.execute({ sql: `UPDATE ingredients SET is_active = 0`, args: [] });
for (const [name, unit, cost] of INSUMOS) {
  const { s, m } = stk(unit);
  await db.execute({
    sql: `INSERT INTO ingredients (id, name, unit, stock_qty, min_stock_qty, cost_unit, is_active)
          VALUES (?,?,?,?,?,?,1)
          ON CONFLICT(name) DO UPDATE SET unit=excluded.unit, cost_unit=excluded.cost_unit, is_active=1, updated_at=datetime('now')`,
    args: [randomUUID(), name, unit, s, m, cost],
  });
}
const ing = new Map((await db.execute({ sql: `SELECT id, name, cost_unit FROM ingredients WHERE is_active=1`, args: [] })).rows.map((r) => [r.name, { id: r.id, cost: Number(r.cost_unit) }]));

// 2) Recetas (replace-all) + food cost.
let ok = 0; const resumen = [];
for (const [prodName, lines] of Object.entries(R)) {
  const prod = (await db.execute({ sql: `SELECT id, price FROM products WHERE name = ? AND is_active = 1`, args: [prodName] })).rows[0];
  if (!prod) { console.log('⚠ no encontrado:', prodName); continue; }
  const stmts = [{ sql: `DELETE FROM product_recipes WHERE product_id = ?`, args: [prod.id] }];
  let costo = 0;
  for (const [iname, qty] of lines) {
    const it = ing.get(iname); if (!it) { console.log('⚠ insumo:', iname); continue; }
    costo += qty * it.cost;
    stmts.push({ sql: `INSERT INTO product_recipes (id, product_id, ingredient_id, qty_per_unit) VALUES (?,?,?,?)`, args: [randomUUID(), prod.id, it.id, qty] });
  }
  await db.batch(stmts, 'write'); ok++;
  const price = Number(prod.price);
  resumen.push({ prodName, price, costo, fc: price > 0 ? Math.round(costo / price * 100) : 0 });
}
console.log(`\nInsumos: ${INSUMOS.length} · Recetas: ${ok}/${Object.keys(R).length}\n`);
console.log('Producto'.padEnd(42), 'Precio'.padStart(9), 'Costo'.padStart(9), 'FoodCost');
resumen.sort((a, b) => b.fc - a.fc).forEach((r) => console.log(r.prodName.slice(0, 41).padEnd(42), money(r.price).padStart(9), money(Math.round(r.costo)).padStart(9), (r.fc + '%').padStart(8)));
console.log('\n(*) Estimaciones iniciales — ajusta costos en Inventario y cantidades en Carta.');
