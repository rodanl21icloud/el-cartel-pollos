// ============================================================
// Reset transaccional + import de export Treinta (ventas + gastos).
// 1) Respaldo LÓGICO (JSON) de las tablas que se vacían.
// 2) Vacía solo lo TRANSACCIONAL (conserva catálogo, recetas, insumos,
//    modificadores, clientes, usuarios, ajustes y configuración).
// 3) Importa ventas (con ítems por producto) y gastos de los .xlsx dados.
//
// Uso (pasar los .xlsx como argumentos):
//   node --env-file=.env            scripts/reset-import-treinta.mjs A.xlsx B.xlsx
//   node --env-file=.env.production scripts/reset-import-treinta.mjs A.xlsx B.xlsx
// ============================================================
import xlsx from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/db.js';
import { chileBusinessDay } from '../src/services/sales.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILES = process.argv.slice(2).filter((a) => a.toLowerCase().endsWith('.xlsx'));
if (!FILES.length) { console.error('✗ Pasa al menos un archivo .xlsx como argumento.'); process.exit(1); }
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

// ---------- 0) RESPALDO LÓGICO ----------
const WIPE = ['sale_items', 'sales', 'expenses', 'inventory_adjustments', 'cash_movements', 'cash_register_closures', 'cash_sessions',
  'bank_movements', 'loyalty_transactions', 'loyalty_accounts', 'ops_task', 'ops_checklist_item', 'operational_day',
  'product_cost_snapshots', 'cost_deviation_alerts', 'tax_period_snapshots', 'tax_simulation_entries', 'tax_simulation_scenarios', 'liquidity_scenarios'];
const dump = {};
for (const t of WIPE) { try { dump[t] = (await db.execute(`SELECT * FROM ${t}`)).rows; } catch { dump[t] = null; } }
const bdir = path.join(__dirname, '..', 'backups'); fs.mkdirSync(bdir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bfile = path.join(bdir, `pre-import-${stamp}.json`);
fs.writeFileSync(bfile, JSON.stringify(dump));
console.log('Respaldo lógico:', bfile);
console.log('  ', Object.entries(dump).map(([t, r]) => `${t}:${r ? r.length : '-'}`).join('  '));

// ---------- 1) VACIAR transaccional ----------
await db.execute(`PRAGMA foreign_keys=OFF`);
for (const t of WIPE) { try { await db.execute(`DELETE FROM ${t}`); } catch (e) { console.log('  (omito', t + ')', e.message); } }
await db.execute(`PRAGMA foreign_keys=ON`);
console.log('✓ Tablas transaccionales vaciadas.');

// ---------- 2) LEER archivos: ventas + gastos + precios ----------
const priceMap = new Map(); const ventas = []; const gastos = [];
for (const f of FILES) {
  const wb = xlsx.readFile(f);
  const h1 = xlsx.utils.sheet_to_json(wb.Sheets['Hoja1'], { header: 1, raw: false, defval: '' });
  const hr = headerRow(h1, ['fecha', 'tipo', 'valor']); const c = h1[hr].map(norm); const ci = (n) => c.indexOf(n);
  const I = { fecha: ci('fecha'), tipo: ci('tipo'), desc: ci('descripción'), cat: ci('categoría de gasto'), contacto: ci('contacto'), met: ci('m. de pago'), val: ci('valor') };
  let vf = 0, gf = 0;
  for (let i = hr + 1; i < h1.length; i++) {
    const r = h1[i]; const tipo = String(r[I.tipo] || '').trim(); const date = parseDate(r[I.fecha]); if (!date) continue;
    if (tipo === 'Venta') { ventas.push({ date, metodo: String(r[I.met]).trim(), valor: money(r[I.val]), desc: String(r[I.desc] || '').trim() }); vf++; }
    else if (tipo === 'Gasto') { gastos.push({ date, metodo: String(r[I.met]).trim(), valor: money(r[I.val]), desc: String(r[I.desc] || '').trim(), cat: String(r[I.cat] || '').trim(), contacto: String(r[I.contacto] || '').trim() }); gf++; }
  }
  const h2 = xlsx.utils.sheet_to_json(wb.Sheets['Hoja2'], { header: 1, raw: false, defval: '' });
  const hr2 = headerRow(h2, ['produto', 'total']); const c2 = h2[hr2].map(norm); const pi = c2.indexOf('produto'); const pri = c2.indexOf('precio unitario');
  for (let i = hr2 + 1; i < h2.length; i++) { const r = h2[i]; const p = String(r[pi] || '').trim(); if (p && !priceMap.has(p)) priceMap.set(p, money(r[pri])); }
  console.log(`  ${path.basename(f)}: ${vf} ventas · ${gf} gastos`);
}
console.log(`Leído: ${ventas.length} ventas · ${gastos.length} gastos · ${priceMap.size} productos.`);

// ---------- 3) Usuario base ----------
const userId = (await db.execute({ sql: `SELECT id FROM users ORDER BY (role='GERENCIA') DESC LIMIT 1`, args: [] })).rows[0].id;

// ---------- 4) Emparejar / crear productos ----------
const existing = (await db.execute({ sql: `SELECT id, name FROM products`, args: [] })).rows;
const byKey = new Map(existing.map((p) => [nameKey(p.name), p.id])); const prodId = new Map(); let nuevos = 0;
{ const stmts = []; let n = existing.length;
  for (const [name, price] of priceMap) { const k = nameKey(name);
    if (byKey.has(k)) { prodId.set(name, byKey.get(k)); continue; }
    const id = randomUUID(); prodId.set(name, id); byKey.set(k, id);
    stmts.push({ sql: `INSERT INTO products (id, sku, name, price, category, is_active, in_catalog) VALUES (?,?,?,?,?,0,0)`, args: [id, 'HIST-' + String(++n).padStart(3, '0'), name, price, categoria(name)] }); nuevos++; }
  if (stmts.length) await db.batch(stmts, 'write'); }
console.log(`Productos: ${prodId.size - nuevos} emparejados · ${nuevos} creados (inactivos, histórico).`);

// ---------- 5) Parser de ítems desde la descripción ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = [...priceMap.keys()].sort((a, b) => b.length - a.length);
const re = new RegExp('(\\d+)\\s+(' + names.map(esc).join('|') + ')', 'g');
const parseItems = (desc) => { const agg = new Map(); let m; re.lastIndex = 0; while ((m = re.exec(desc))) agg.set(m[2], (agg.get(m[2]) || 0) + Number(m[1])); return agg; };

// ---------- 6) Insertar VENTAS + ítems ----------
const cmp = (a, b) => (a.date.y - b.date.y) || (a.date.mo - b.date.mo) || (a.date.d - b.date.d);
ventas.sort(cmp);
let stmts = [], salesN = 0, itemsN = 0, idxDay = 0, lastKey = ''; const orderCounter = new Map();
const flush = async () => { if (stmts.length) { await db.batch(stmts, 'write'); stmts = []; } };
for (const v of ventas) {
  const dayKey = `${v.date.y}-${v.date.mo}-${v.date.d}`; if (dayKey !== lastKey) { idxDay = 0; lastKey = dayKey; }
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
console.log(`✓ Ventas importadas: ${salesN} · ítems ${itemsN}`);

// ---------- 7) Insertar GASTOS ----------
const cats = (await db.execute(`SELECT id, name FROM expense_categories`)).rows;
let otrosId = cats.find((c) => /^otros$/i.test(c.name))?.id;
if (!otrosId) { otrosId = 'cat-otros'; await db.execute({ sql: `INSERT OR IGNORE INTO expense_categories (id, name, kind) VALUES ('cat-otros','Otros','OPERATIVO')`, args: [] }); }
const catByName = new Map(cats.map((c) => [nameKey(c.name), c.id]));
const catFor = (n) => catByName.get(nameKey(n)) || otrosId;
gastos.sort(cmp); let gstmts = [], gN = 0;
for (const g of gastos) {
  const amount = g.valor; if (!(amount > 0)) continue;
  const spentAt = new Date(Date.UTC(g.date.y, g.date.mo, g.date.d, 16, 0, 0)).toISOString();
  const supplier = g.contacto && g.contacto !== '-' && g.contacto !== ' - ' ? g.contacto : null;
  const desc = g.desc || g.cat || 'Gasto';
  gstmts.push({ sql: `INSERT INTO expenses (id, category_id, user_id, amount, payment_method, supplier, description, spent_at) VALUES (?,?,?,?,?,?,?,?)`,
    args: [randomUUID(), catFor(g.cat), userId, amount, METODO[g.metodo] || 'EFECTIVO', supplier, desc, spentAt] }); gN++;
  if (gstmts.length >= 400) { await db.batch(gstmts, 'write'); gstmts = []; }
}
if (gstmts.length) await db.batch(gstmts, 'write');
console.log(`✓ Gastos importados: ${gN}`);

// ---------- 8) Resumen ----------
const r = (await db.execute(`SELECT substr(sold_at,1,7) m, COUNT(*) n, COALESCE(SUM(total),0) t FROM sales GROUP BY m ORDER BY m`)).rows;
for (const x of r) console.log(`  ${x.m}: ${x.n} ventas · $${Number(x.t).toLocaleString('es-CL')}`);
const tv = (await db.execute(`SELECT COUNT(*) n, COALESCE(SUM(total),0) t FROM sales`)).rows[0];
const tg = (await db.execute(`SELECT COUNT(*) n, COALESCE(SUM(amount),0) t FROM expenses`)).rows[0];
console.log(`TOTAL -> ${tv.n} ventas ($${Number(tv.t).toLocaleString('es-CL')}) · ${tg.n} gastos ($${Number(tg.t).toLocaleString('es-CL')})`);
console.log('\nListo. Respaldo de lo borrado en:', bfile);
