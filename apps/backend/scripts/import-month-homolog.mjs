// ============================================================
// Homologa las transacciones de UN MES a un export Treinta.
// 1) Respaldo lógico (JSON) de las ventas/ítems/gastos del mes.
// 2) Borra SOLO ese mes (ventas + ítems + gastos). No toca inventario/caja/otros meses.
// 3) Importa ventas (con ítems) y gastos del .xlsx.
//
//   node --env-file=.env.production scripts/import-month-homolog.mjs 2026-06 archivo.xlsx
// ============================================================
import xlsx from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/db.js';
import { chileBusinessDay } from '../src/services/sales.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONTH = process.argv[2];                 // 'YYYY-MM'
const FILE = process.argv[3];
if (!/^\d{4}-\d{2}$/.test(MONTH || '') || !FILE?.toLowerCase().endsWith('.xlsx')) {
  console.error('Uso: import-month-homolog.mjs YYYY-MM archivo.xlsx'); process.exit(1);
}
const [Y, M] = MONTH.split('-').map(Number);
const db = getDb();

const MONTHS = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };
const norm = (s) => String(s || '').trim().toLowerCase().replace(/:$/, '');
const money = (s) => Number(String(s || '').replace(/[^\d.-]/g, '')) || 0;
const nameKey = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
const METODO = { 'Efectivo': 'EFECTIVO', 'Tarjeta': 'POS', 'Transferencia Bancaria': 'TRANSFERENCIA', 'Transferencia': 'TRANSFERENCIA', 'Otro': 'TRANSFERENCIA' };
const headerRow = (rows, keys) => { for (let i = 0; i < Math.min(rows.length, 30); i++) { const set = rows[i].map(norm); if (keys.every((k) => set.includes(k))) return i; } return -1; };
const parseDate = (s) => { const m = String(s).trim().match(/^(\d{1,2})\s+([a-zç]+)\s+(\d{4})/i); if (!m) return null; const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; return mo == null ? null : { y: +m[3], mo, d: +m[1] }; };
const categoria = (name) => { const n = name.toUpperCase();
  if (/COMBO/.test(n)) return 'COMBOS'; if (/COLACI|MENÚ|MENU/.test(n)) return 'COLACIONES'; if (/PAPA/.test(n)) return 'PAPAS';
  if (/POLLO|CUARTO|MEDIO|BROASTER/.test(n)) return 'POLLO'; if (/BEBIDA|AGUA|JUGO|COCA|SCORE|POWERADE|MOTE|\.UP/.test(n)) return 'BEBIDAS';
  if (/SALSA|ARO|EMPANAD|SOPAIP|TEQUE|CANASTA|SALCHIP/.test(n)) return 'SNACKS'; return 'OTROS'; };
const inMonth = (d) => d && d.y === Y && d.mo === M - 1;
const like = `${MONTH}%`;

// ---------- 0) RESPALDO del mes ----------
const bkSales = (await db.execute({ sql: `SELECT * FROM sales WHERE business_day LIKE ?`, args: [like] })).rows;
const bkItems = (await db.execute({ sql: `SELECT si.* FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.business_day LIKE ?`, args: [like] })).rows;
const bkExp = (await db.execute({ sql: `SELECT * FROM expenses WHERE spent_at LIKE ?`, args: [like] })).rows;
const bdir = path.join(__dirname, '..', 'backups'); fs.mkdirSync(bdir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bfile = path.join(bdir, `homolog-${MONTH}-${stamp}.json`);
fs.writeFileSync(bfile, JSON.stringify({ sales: bkSales, sale_items: bkItems, expenses: bkExp }));
console.log(`Respaldo: ${bfile}  (ventas ${bkSales.length} · ítems ${bkItems.length} · gastos ${bkExp.length})`);

// ---------- 1) BORRAR el mes ----------
await db.execute({ sql: `DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE business_day LIKE ?)`, args: [like] });
await db.execute({ sql: `DELETE FROM sales WHERE business_day LIKE ?`, args: [like] });
await db.execute({ sql: `DELETE FROM expenses WHERE spent_at LIKE ?`, args: [like] });
console.log(`✓ Junio borrado en BD (mes ${MONTH}).`);

// ---------- 2) LEER archivo ----------
const wb = xlsx.readFile(FILE);
const h1 = xlsx.utils.sheet_to_json(wb.Sheets['Hoja1'], { header: 1, raw: false, defval: '' });
const hr = headerRow(h1, ['fecha', 'tipo', 'valor']); const c = h1[hr].map(norm); const ci = (n) => c.indexOf(n);
const I = { fecha: ci('fecha'), tipo: ci('tipo'), desc: ci('descripción'), cat: ci('categoría de gasto'), contacto: ci('contacto'), met: ci('m. de pago'), val: ci('valor') };
const ventas = [], gastos = [];
for (let i = hr + 1; i < h1.length; i++) {
  const r = h1[i]; const date = parseDate(r[I.fecha]); if (!inMonth(date)) continue; const tipo = String(r[I.tipo] || '').trim();
  if (tipo === 'Venta') ventas.push({ date, metodo: String(r[I.met]).trim(), valor: money(r[I.val]), desc: String(r[I.desc] || '').trim() });
  else if (tipo === 'Gasto') gastos.push({ date, metodo: String(r[I.met]).trim(), valor: money(r[I.val]), desc: String(r[I.desc] || '').trim(), cat: String(r[I.cat] || '').trim(), contacto: String(r[I.contacto] || '').trim() });
}
const priceMap = new Map();
const h2 = xlsx.utils.sheet_to_json(wb.Sheets['Hoja2'], { header: 1, raw: false, defval: '' });
const hr2 = headerRow(h2, ['produto', 'total']); const c2 = h2[hr2].map(norm); const pi = c2.indexOf('produto'); const pri = c2.indexOf('precio unitario');
for (let i = hr2 + 1; i < h2.length; i++) { const r = h2[i]; const p = String(r[pi] || '').trim(); if (p && !priceMap.has(p)) priceMap.set(p, money(r[pri])); }
console.log(`Leído ${MONTH}: ${ventas.length} ventas · ${gastos.length} gastos · ${priceMap.size} productos.`);

const userId = (await db.execute({ sql: `SELECT id FROM users ORDER BY (role='GERENCIA') DESC LIMIT 1`, args: [] })).rows[0].id;

// ---------- 3) Emparejar / crear productos ----------
const existing = (await db.execute({ sql: `SELECT id, name FROM products`, args: [] })).rows;
const byKey = new Map(existing.map((p) => [nameKey(p.name), p.id])); const prodId = new Map(); let nuevos = 0;
{ const stmts = []; let n = existing.length;
  for (const [name, price] of priceMap) { const k = nameKey(name);
    if (byKey.has(k)) { prodId.set(name, byKey.get(k)); continue; }
    const id = randomUUID(); prodId.set(name, id); byKey.set(k, id);
    stmts.push({ sql: `INSERT INTO products (id, sku, name, price, category, is_active, in_catalog) VALUES (?,?,?,?,?,0,0)`, args: [id, 'HIST-' + String(++n).padStart(3, '0'), name, price, categoria(name)] }); nuevos++; }
  if (stmts.length) await db.batch(stmts, 'write'); }
console.log(`Productos: ${prodId.size - nuevos} emparejados · ${nuevos} creados.`);

// ---------- 4) Parser de ítems ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = [...priceMap.keys()].sort((a, b) => b.length - a.length);
const re = new RegExp('(\\d+)\\s+(' + names.map(esc).join('|') + ')', 'g');
const parseItems = (desc) => { const agg = new Map(); let m; re.lastIndex = 0; while ((m = re.exec(desc))) agg.set(m[2], (agg.get(m[2]) || 0) + Number(m[1])); return agg; };

// ---------- 5) Insertar ventas + ítems ----------
const cmp = (a, b) => a.date.d - b.date.d;
ventas.sort(cmp);
let stmts = [], salesN = 0, itemsN = 0, idxDay = 0, lastKey = ''; const orderCounter = new Map();
const flush = async () => { if (stmts.length) { await db.batch(stmts, 'write'); stmts = []; } };
for (const v of ventas) {
  const dayKey = `${v.date.d}`; if (dayKey !== lastKey) { idxDay = 0; lastKey = dayKey; }
  const soldAt = new Date(Date.UTC(v.date.y, v.date.mo, v.date.d, 15, Math.floor(idxDay / 60) % 9, idxDay % 60, 0)).toISOString(); idxDay++;
  const businessDay = chileBusinessDay(new Date(soldAt));
  const ordN = (orderCounter.get(businessDay) || 0) + 1; orderCounter.set(businessDay, ordN);
  const saleId = randomUUID(); const items = parseItems(v.desc); let subtotal = 0; const itemStmts = [];
  for (const [name, qty] of items) { const pid = prodId.get(name); if (!pid) continue; const price = priceMap.get(name) || 0; const lt = price * qty; subtotal += lt;
    itemStmts.push({ sql: `INSERT INTO sale_items (id, sale_id, product_id, qty, unit_price, line_total) VALUES (?,?,?,?,?,?)`, args: [randomUUID(), saleId, pid, qty, price, lt] }); itemsN++; }
  stmts.push({ sql: `INSERT INTO sales (id, client_uuid, user_id, total, subtotal, payment_method, status, payload_hash, synced_offline, business_day, order_number, kind, dispatch_status, sold_at)
        VALUES (?,?,?,?,?,?, 'CONFIRMADA', 'IMPORT-TREINTA', 0, ?,?, 'PRODUCTOS', 'ENTREGADO', ?)`,
    args: [saleId, randomUUID(), userId, v.valor, subtotal || v.valor, METODO[v.metodo] || 'EFECTIVO', businessDay, ordN, soldAt] });
  stmts.push(...itemStmts); salesN++; if (stmts.length >= 400) await flush();
}
await flush();

// ---------- 6) Insertar gastos ----------
const cats = (await db.execute(`SELECT id, name, kind FROM expense_categories WHERE is_active=1`)).rows;
const otrosId = cats.find((x) => /proveedor|insumo|compra|otros/i.test(x.name))?.id || cats.find((x) => x.kind !== 'RETIRO')?.id || cats[0]?.id;
const catByName = new Map(cats.map((x) => [nameKey(x.name), x.id]));
let gN = 0, gstmts = [];
for (const g of gastos) { if (!(g.valor > 0)) continue;
  const spentAt = new Date(Date.UTC(g.date.y, g.date.mo, g.date.d, 16, 0, 0)).toISOString();
  const supplier = g.contacto && g.contacto !== '-' && g.contacto !== ' - ' ? g.contacto : null;
  gstmts.push({ sql: `INSERT INTO expenses (id, category_id, user_id, amount, payment_method, supplier, description, spent_at) VALUES (?,?,?,?,?,?,?,?)`,
    args: [randomUUID(), catByName.get(nameKey(g.cat)) || otrosId, userId, g.valor, METODO[g.metodo] || 'EFECTIVO', supplier, g.desc || g.cat || 'Gasto', spentAt] }); gN++;
  if (gstmts.length >= 400) { await db.batch(gstmts, 'write'); gstmts = []; }
}
if (gstmts.length) await db.batch(gstmts, 'write');

// ---------- Resumen ----------
const sv = (await db.execute({ sql: `SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM sales WHERE business_day LIKE ?`, args: [like] })).rows[0];
const sg = (await db.execute({ sql: `SELECT COUNT(*) n, COALESCE(SUM(amount),0) t FROM expenses WHERE spent_at LIKE ?`, args: [like] })).rows[0];
console.log(`✓ ${MONTH} homologado -> ${sv.n} ventas ($${Number(sv.t).toLocaleString('es-CL')}) · ${sg.n} gastos ($${Number(sg.t).toLocaleString('es-CL')})`);
console.log('Respaldo de lo borrado:', bfile);
