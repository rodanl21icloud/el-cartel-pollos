// Importa el historial real (export Treinta) a la base: productos, ventas con
// detalle de ítems, y gastos. Uso: node --env-file=.env scripts/importTreinta.mjs
import xlsx from 'xlsx';
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/db.js';
import { chileBusinessDay } from '../src/services/sales.js';

// Carpeta con los .xlsx (export Treinta). Pasar como argumento o usar el default.
const DIR = (process.argv[2] || 'C:/Users/rodri/Downloads/30/').replace(/\\/g, '/').replace(/\/?$/, '/');
const FILES = ['enero', 'febrero', 'marzo', 'abril', 'mayo'];
const db = getDb();

const MONTHS = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
const norm = (s) => String(s || '').trim().toLowerCase().replace(/:$/, '');
const money = (s) => Number(String(s || '').replace(/[^\d.-]/g, '')) || 0;
const METODO = { 'Efectivo': 'EFECTIVO', 'Tarjeta': 'POS', 'Transferencia Bancaria': 'TRANSFERENCIA', 'Otro': 'TRANSFERENCIA' };

function headerRow(rows, keys) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const set = rows[i].map(norm);
    if (keys.every((k) => set.includes(k))) return i;
  }
  return -1;
}
function parseDate(s) { // "02 ene 2026"
  const m = String(s).trim().match(/^(\d{1,2})\s+([a-zç]+)\s+(\d{4})/i);
  if (!m) return null;
  const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (mon == null) return null;
  return { y: +m[3], mo: mon, d: +m[1] };
}
function categoria(name) {
  const n = name.toUpperCase();
  if (/COMBO/.test(n)) return 'COMBOS';
  if (/COLACI|MENÚ|MENU/.test(n)) return 'COLACIONES';
  if (/PAPA/.test(n)) return 'PAPAS';
  if (/POLLO|CUARTO|MEDIO|BROASTER/.test(n)) return 'POLLO';
  if (/BEBIDA|AGUA|JUGO|COCA|SCORE|\.UP/.test(n)) return 'BEBIDAS';
  if (/SALSA|ARO|EMPANAD|SOPAIP|TEQUE|CANASTA|SALCHIP/.test(n)) return 'SNACKS';
  return 'OTROS';
}

// ---------- 1) Leer todo ----------
const priceMap = new Map();   // producto -> precio
const ventas = [];            // { date, metodo, valor, desc }
const gastos = [];            // { date, cat, metodo, valor, desc }
for (const f of FILES) {
  const wb = xlsx.readFile(DIR + f + '.xlsx');
  const h1 = xlsx.utils.sheet_to_json(wb.Sheets['Hoja1'], { header: 1, raw: false, defval: '' });
  const hr = headerRow(h1, ['fecha', 'tipo', 'valor']); const c = h1[hr].map(norm);
  const ci = (n) => c.indexOf(n);
  const I = { fecha: ci('fecha'), tipo: ci('tipo'), desc: ci('descripción'), cat: ci('categoría de gasto'), met: ci('m. de pago'), val: ci('valor') };
  for (let i = hr + 1; i < h1.length; i++) {
    const r = h1[i]; const tipo = String(r[I.tipo] || '').trim(); if (!tipo) continue;
    const date = parseDate(r[I.fecha]); if (!date) continue;
    if (tipo === 'Venta') ventas.push({ date, metodo: String(r[I.met]).trim(), valor: money(r[I.val]), desc: String(r[I.desc] || '').trim() });
    else if (tipo === 'Gasto') gastos.push({ date, cat: String(r[I.cat]).trim(), metodo: String(r[I.met]).trim(), valor: money(r[I.val]), desc: String(r[I.desc] || '').trim() });
  }
  const h2 = xlsx.utils.sheet_to_json(wb.Sheets['Hoja2'], { header: 1, raw: false, defval: '' });
  const hr2 = headerRow(h2, ['produto', 'total']); const c2 = h2[hr2].map(norm);
  const pi = c2.indexOf('produto'); const pri = c2.indexOf('precio unitario');
  for (let i = hr2 + 1; i < h2.length; i++) {
    const r = h2[i]; const p = String(r[pi] || '').trim(); if (!p) continue;
    if (!priceMap.has(p)) priceMap.set(p, money(r[pri]));
  }
}
console.log(`Leído: ${ventas.length} ventas, ${gastos.length} gastos, ${priceMap.size} productos.`);

// ---------- 2) Usuario base ----------
const userId = (await db.execute({ sql: `SELECT id FROM users ORDER BY (role='GERENCIA') DESC LIMIT 1`, args: [] })).rows[0].id;

// ---------- 3) Ajustes del negocio ----------
await db.execute({ sql: `INSERT OR IGNORE INTO business_settings (id, name, phone) VALUES (1,'El Cartel de los Pollos','+56 9 3720 9677')`, args: [] });

// ---------- 4) Crear productos ----------
const prodId = new Map();
{
  const stmts = [];
  let n = 0;
  for (const [name, price] of priceMap) {
    const id = randomUUID(); prodId.set(name, id);
    stmts.push({ sql: `INSERT INTO products (id, sku, name, price, category) VALUES (?,?,?,?,?)`,
      args: [id, 'IMP-' + String(++n).padStart(3, '0'), name, price, categoria(name)] });
  }
  await db.batch(stmts, 'write');
}
console.log(`Productos creados: ${prodId.size}`);

// Alternación de nombres (más largos primero) para parsear descripciones.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = [...priceMap.keys()].sort((a, b) => b.length - a.length);
const re = new RegExp('(\\d+)\\s+(' + names.map(esc).join('|') + ')', 'g');
function parseItems(desc) {
  const agg = new Map(); let m;
  re.lastIndex = 0;
  while ((m = re.exec(desc))) { const name = m[2]; agg.set(name, (agg.get(name) || 0) + Number(m[1])); }
  return agg;
}

// ---------- 5) Categorías de gasto ----------
const catId = new Map();
{
  const distintas = [...new Set(gastos.map((g) => g.cat === 'No Aplica' ? 'Ajustes / descuadres' : g.cat))];
  const stmts = [];
  for (const name of distintas) {
    const id = randomUUID(); catId.set(name, id);
    const kind = /retiro|socio/i.test(name) ? 'RETIRO' : 'OPERATIVO';
    stmts.push({ sql: `INSERT INTO expense_categories (id, name, kind) VALUES (?,?,?)
                       ON CONFLICT(name) DO UPDATE SET name=excluded.name`, args: [id, name, kind] });
  }
  await db.batch(stmts, 'write');
  // releer ids reales (por si hubo conflicto)
  const rows = (await db.execute({ sql: `SELECT id, name FROM expense_categories`, args: [] })).rows;
  for (const r of rows) catId.set(r.name, r.id);
}

// ---------- 6) Insertar ventas + ítems ----------
ventas.sort((a, b) => (a.date.y - b.date.y) || (a.date.mo - b.date.mo) || (a.date.d - b.date.d));
const orderCounter = new Map(); // business_day -> n
let stmts = []; let salesN = 0, itemsN = 0, idxDay = 0, lastKey = '';
async function flush() { if (stmts.length) { await db.batch(stmts, 'write'); stmts = []; } }
for (const v of ventas) {
  const dayKey = `${v.date.y}-${v.date.mo}-${v.date.d}`;
  if (dayKey !== lastKey) { idxDay = 0; lastKey = dayKey; }
  const soldAt = new Date(Date.UTC(v.date.y, v.date.mo, v.date.d, 15, Math.floor(idxDay / 60) % 9, idxDay % 60, 0)).toISOString();
  idxDay++;
  const businessDay = chileBusinessDay(new Date(soldAt));
  const ordN = (orderCounter.get(businessDay) || 0) + 1; orderCounter.set(businessDay, ordN);
  const saleId = randomUUID();
  const items = parseItems(v.desc);
  let subtotal = 0;
  const itemStmts = [];
  for (const [name, qty] of items) {
    const pid = prodId.get(name); if (!pid) continue;
    const price = priceMap.get(name) || 0; const lt = price * qty; subtotal += lt;
    itemStmts.push({ sql: `INSERT INTO sale_items (id, sale_id, product_id, qty, unit_price, line_total) VALUES (?,?,?,?,?,?)`,
      args: [randomUUID(), saleId, pid, qty, price, lt] });
    itemsN++;
  }
  stmts.push({
    sql: `INSERT INTO sales (id, client_uuid, user_id, total, subtotal, payment_method, status, payload_hash,
            synced_offline, business_day, order_number, kind, dispatch_status, sold_at)
          VALUES (?,?,?,?,?,?, 'CONFIRMADA', 'IMPORT', 0, ?,?, 'PRODUCTOS', 'ENTREGADO', ?)`,
    args: [saleId, randomUUID(), userId, v.valor, subtotal || v.valor, METODO[v.metodo] || 'EFECTIVO', businessDay, ordN, soldAt],
  });
  stmts.push(...itemStmts);
  salesN++;
  if (stmts.length >= 400) await flush();
}
await flush();
console.log(`Ventas insertadas: ${salesN} · ítems: ${itemsN}`);

// ---------- 7) Insertar gastos ----------
stmts = []; let gN = 0;
for (const g of gastos) {
  const catName = g.cat === 'No Aplica' ? 'Ajustes / descuadres' : g.cat;
  const cid = catId.get(catName); if (!cid) continue;
  const spentAt = new Date(Date.UTC(g.date.y, g.date.mo, g.date.d, 15, 0, gN % 60)).toISOString();
  stmts.push({ sql: `INSERT INTO expenses (id, category_id, user_id, amount, payment_method, description, spent_at)
                     VALUES (?,?,?,?,?,?,?)`,
    args: [randomUUID(), cid, userId, g.valor, METODO[g.metodo] || 'EFECTIVO', g.desc || catName, spentAt] });
  gN++;
  if (stmts.length >= 400) await flush();
}
await flush();
console.log(`Gastos insertados: ${gN}`);

// ---------- Resumen ----------
const tot = (await db.execute({ sql: `SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM sales`, args: [] })).rows[0];
const gas = (await db.execute({ sql: `SELECT COUNT(*) n, COALESCE(SUM(amount),0) t FROM expenses`, args: [] })).rows[0];
console.log(`\nTOTAL en BD -> ventas: ${tot.n} ($${Number(tot.t).toLocaleString('es-CL')}) · gastos: ${gas.n} ($${Number(gas.t).toLocaleString('es-CL')})`);
