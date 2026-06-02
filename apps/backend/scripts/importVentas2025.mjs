// ============================================================
// Importa SOLO ventas (con detalle de ítems) de sep–dic 2025 (export Treinta),
// para tener historial y estadísticas. NO importa gastos.
// - No duplica productos: empareja por nombre normalizado con el catálogo
//   actual; los productos de 2025 que ya no existen se crean INACTIVOS y
//   ocultos del catálogo (solo para estadística histórica).
// - Guardia anti-duplicado: aborta si ya hay ventas de 2025 en la base.
//
// Local:       node --env-file=.env            scripts/importVentas2025.mjs
// Producción:  node --env-file=.env.production scripts/importVentas2025.mjs
// ============================================================
import xlsx from 'xlsx';
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/db.js';
import { chileBusinessDay } from '../src/services/sales.js';

const DIR = (process.argv[2] || 'C:/Users/rodri/Downloads/30/').replace(/\\/g, '/').replace(/\/?$/, '/');
const FILES = ['202509', '202510', '202511', '202512'];
const db = getDb();

const MONTHS = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
const norm = (s) => String(s || '').trim().toLowerCase().replace(/:$/, '');
const money = (s) => Number(String(s || '').replace(/[^\d.-]/g, '')) || 0;
const nameKey = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
const METODO = { 'Efectivo': 'EFECTIVO', 'Tarjeta': 'POS', 'Transferencia Bancaria': 'TRANSFERENCIA', 'Otro': 'TRANSFERENCIA' };

function headerRow(rows, keys) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const set = rows[i].map(norm);
    if (keys.every((k) => set.includes(k))) return i;
  }
  return -1;
}
function parseDate(s) { // "01 sept 2025"
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
  if (/BEBIDA|AGUA|JUGO|COCA|SCORE|POWERADE|MOTE|\.UP/.test(n)) return 'BEBIDAS';
  if (/SALSA|ARO|EMPANAD|SOPAIP|TEQUE|CANASTA|SALCHIP/.test(n)) return 'SNACKS';
  return 'OTROS';
}

// ---------- Guardia anti-duplicado ----------
const ya = (await db.execute({ sql: `SELECT COUNT(*) n FROM sales WHERE sold_at LIKE '2025-%'`, args: [] })).rows[0].n;
if (Number(ya) > 0) {
  console.error(`✗ Ya existen ${ya} ventas de 2025 en la base. Importación abortada (evita duplicar).`);
  process.exit(1);
}

// ---------- 1) Leer archivos ----------
const priceMap = new Map(); // nombre -> precio (de Hoja2)
const ventas = [];          // { date, metodo, valor, desc }
for (const f of FILES) {
  const wb = xlsx.readFile(DIR + f + '.xlsx');
  const h1 = xlsx.utils.sheet_to_json(wb.Sheets['Hoja1'], { header: 1, raw: false, defval: '' });
  const hr = headerRow(h1, ['fecha', 'tipo', 'valor']); const c = h1[hr].map(norm);
  const ci = (n) => c.indexOf(n);
  const I = { fecha: ci('fecha'), tipo: ci('tipo'), desc: ci('descripción'), met: ci('m. de pago'), val: ci('valor') };
  let vf = 0;
  for (let i = hr + 1; i < h1.length; i++) {
    const r = h1[i]; const tipo = String(r[I.tipo] || '').trim(); if (tipo !== 'Venta') continue; // SOLO ventas
    const date = parseDate(r[I.fecha]); if (!date) continue;
    ventas.push({ date, metodo: String(r[I.met]).trim(), valor: money(r[I.val]), desc: String(r[I.desc] || '').trim() });
    vf++;
  }
  const h2 = xlsx.utils.sheet_to_json(wb.Sheets['Hoja2'], { header: 1, raw: false, defval: '' });
  const hr2 = headerRow(h2, ['produto', 'total']); const c2 = h2[hr2].map(norm);
  const pi = c2.indexOf('produto'); const pri = c2.indexOf('precio unitario');
  for (let i = hr2 + 1; i < h2.length; i++) {
    const r = h2[i]; const p = String(r[pi] || '').trim(); if (!p) continue;
    if (!priceMap.has(p)) priceMap.set(p, money(r[pri]));
  }
  console.log(`  ${f}: ${vf} ventas`);
}
console.log(`Leído: ${ventas.length} ventas · ${priceMap.size} productos distintos.`);

// ---------- 2) Usuario base ----------
const userId = (await db.execute({ sql: `SELECT id FROM users ORDER BY (role='GERENCIA') DESC LIMIT 1`, args: [] })).rows[0].id;

// ---------- 3) Emparejar / crear productos ----------
const existing = (await db.execute({ sql: `SELECT id, name FROM products`, args: [] })).rows;
const byKey = new Map(existing.map((p) => [nameKey(p.name), p.id]));
const prodId = new Map(); // nombre del archivo -> product_id
let nuevos = 0;
{
  const stmts = [];
  let n = (await db.execute({ sql: `SELECT COUNT(*) n FROM products`, args: [] })).rows[0].n;
  for (const [name, price] of priceMap) {
    const k = nameKey(name);
    if (byKey.has(k)) { prodId.set(name, byKey.get(k)); continue; }
    // Producto histórico no presente hoy: crear INACTIVO y oculto del catálogo.
    const id = randomUUID(); prodId.set(name, id); byKey.set(k, id);
    stmts.push({
      sql: `INSERT INTO products (id, sku, name, price, category, is_active, in_catalog) VALUES (?,?,?,?,?,0,0)`,
      args: [id, 'H25-' + String(++n).padStart(3, '0'), name, price, categoria(name)],
    });
    nuevos++;
  }
  if (stmts.length) await db.batch(stmts, 'write');
}
console.log(`Productos: ${prodId.size - nuevos} emparejados · ${nuevos} creados (inactivos, solo histórico).`);

// ---------- 4) Parser de ítems desde la descripción ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = [...priceMap.keys()].sort((a, b) => b.length - a.length);
const re = new RegExp('(\\d+)\\s+(' + names.map(esc).join('|') + ')', 'g');
function parseItems(desc) {
  const agg = new Map(); let m; re.lastIndex = 0;
  while ((m = re.exec(desc))) { const name = m[2]; agg.set(name, (agg.get(name) || 0) + Number(m[1])); }
  return agg;
}

// ---------- 5) Insertar ventas + ítems ----------
ventas.sort((a, b) => (a.date.y - b.date.y) || (a.date.mo - b.date.mo) || (a.date.d - b.date.d));
let stmts = []; let salesN = 0, itemsN = 0, idxDay = 0, lastKey = '';
const orderCounter = new Map();
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
  let subtotal = 0; const itemStmts = [];
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
          VALUES (?,?,?,?,?,?, 'CONFIRMADA', 'IMPORT-2025', 0, ?,?, 'PRODUCTOS', 'ENTREGADO', ?)`,
    args: [saleId, randomUUID(), userId, v.valor, subtotal || v.valor, METODO[v.metodo] || 'EFECTIVO', businessDay, ordN, soldAt],
  });
  stmts.push(...itemStmts); salesN++;
  if (stmts.length >= 400) await flush();
}
await flush();
console.log(`\n✓ Importadas ${salesN} ventas · ${itemsN} ítems (sep–dic 2025).`);

// ---------- Resumen ----------
const r = (await db.execute({ sql: `SELECT substr(sold_at,1,7) m, COUNT(*) n, COALESCE(SUM(total),0) t
                                    FROM sales WHERE sold_at LIKE '2025-%' GROUP BY m ORDER BY m`, args: [] })).rows;
for (const x of r) console.log(`  ${x.m}: ${x.n} ventas · $${Number(x.t).toLocaleString('es-CL')}`);
const tot = (await db.execute({ sql: `SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM sales`, args: [] })).rows[0];
console.log(`TOTAL en BD -> ${tot.n} ventas · $${Number(tot.t).toLocaleString('es-CL')}`);
