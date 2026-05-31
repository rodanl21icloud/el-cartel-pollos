// Flujo financiero: apertura de caja con fondo -> venta -> gasto efectivo
// -> depósito -> cierre ciego con cuadratura completa -> flujo de caja.
import crypto from 'node:crypto';
import { getDb } from '../src/db.js';

const BASE = 'http://localhost:3000';
const money = (n) => '$' + Number(n).toLocaleString('es-CL');
function canonicalize(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(',')}]`;
  if (v && typeof v === 'object') {
    const k = Object.keys(v).sort();
    return `{${k.map((x) => JSON.stringify(x) + ':' + canonicalize(v[x])).join(',')}}`;
  }
  return JSON.stringify(v);
}
async function j(r) { return { status: r.status, d: await r.json().catch(() => ({})) }; }

const login = await j(await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'cajero1', password: 'cajero123' }),
}));
const { token, session } = login.d;
const gLogin = await j(await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'gerente', password: 'gerente123' }),
}));
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
const GH = { 'Content-Type': 'application/json', Authorization: `Bearer ${gLogin.d.token}` };

console.log('--- APERTURA DE CAJA ---');
const open = await j(await fetch(`${BASE}/api/cash-register/open`, {
  method: 'POST', headers: H, body: JSON.stringify({ opening_float: 30000 }),
}));
console.log('Apertura fondo $30.000 ->', open.status, open.d.session_id ? 'OK' : open.d.error);
const cur = await j(await fetch(`${BASE}/api/cash-register/current`, { headers: H }));
console.log('Estado caja (CIEGO)    ->', 'open=' + cur.d.open, 'fondo=' + money(cur.d.opening_float),
  '| campos:', Object.keys(cur.d).join(','), '(sin teórico ✓)');

console.log('\n--- VENTA (efectivo) ---');
const payload = { client_uuid: crypto.randomUUID(), payment_method: 'EFECTIVO',
  sold_at: new Date().toISOString(), items: [{ product_id: 'prod-combo-fam', qty: 2 }] };
const hash = crypto.createHmac('sha256', Buffer.from(session.key, 'hex')).update(canonicalize(payload)).digest('hex');
const sale = await j(await fetch(`${BASE}/api/sales/sync`, {
  method: 'POST', headers: H, body: JSON.stringify({ payload, sessionId: session.id, hash }),
}));
console.log('Venta 2 combos efectivo->', sale.status, money(sale.d.total));

console.log('\n--- GASTOS ---');
const cats = await j(await fetch(`${BASE}/api/expenses/categories`, { headers: H }));
console.log('Categorías:', cats.d.map((c) => c.name).join(' · '));
const catProv = cats.d.find((c) => c.id === 'cat-proveedores').id;
const catRetiro = cats.d.find((c) => c.kind === 'RETIRO').id;
// Gasto en efectivo (compra de pollo) -> reduce la caja
const g1 = await j(await fetch(`${BASE}/api/expenses`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ category_id: catProv, amount: 12000, payment_method: 'EFECTIVO',
    description: 'Compra de pollo', supplier: 'Avícola Sur' }),
}));
console.log('Gasto $12.000 efectivo ->', g1.status, g1.d.category);
// Gasto por transferencia (no afecta caja física)
const g2 = await j(await fetch(`${BASE}/api/expenses`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ category_id: catRetiro, amount: 5000, payment_method: 'TRANSFERENCIA',
    description: 'Retiro socio' }),
}));
console.log('Retiro $5.000 transfer ->', g2.status, g2.d.category);

console.log('\n--- DEPÓSITO DE EFECTIVO (sale de caja) ---');
const dep = await j(await fetch(`${BASE}/api/cash-register/movement`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ type: 'DEPOSITO', amount: 20000, reason: 'Depósito al banco' }),
}));
console.log('Depósito $20.000       ->', dep.status, dep.d.movement_id ? 'OK' : dep.d.error);

console.log('\n--- CIERRE CIEGO (cuadratura completa) ---');
// Teórico efectivo = 30000 fondo + 37980 ventas − 12000 gasto − 20000 depósito = 35980
// Declaro 35980 (cuadra) para mostrar el cálculo.
const close = await j(await fetch(`${BASE}/api/cash-register/close`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ efectivo_declarado: 35980, pos_declarado: 0, transferencias_declaradas: 0 }),
}));
const c = close.d;
console.log('Cierre                 ->', close.status, 'descuadre:', c.descuadre);
console.log('  Fondo inicial:', money(c.opening_float));
console.log('  + Ventas efectivo:', money(c.componentes.ventas_efectivo));
console.log('  − Gastos efectivo:', money(c.componentes.gastos_efectivo));
console.log('  +/− Movimientos:', money(c.componentes.movimientos_efectivo));
console.log('  = Efectivo teórico:', money(c.teorico.efectivo), '| Declarado:', money(c.declarado.efectivo),
  '| Diff:', money(c.diferencias.efectivo));

console.log('\n--- FLUJO DE CAJA (gerencia) ---');
const cf = await j(await fetch(`${BASE}/api/reports/cash-flow`, { headers: GH }));
console.log('Ingresos:', money(cf.d.total_ingresos), '| Egresos:', money(cf.d.total_egresos),
  '| Neto:', money(cf.d.neto));
console.log('Egresos por categoría:', cf.d.egresos_por_categoria.map((x) => `${x.categoria}=${money(x.monto)}`).join(', '));
console.log('Por día:', cf.d.por_dia.map((d) => `${d.dia}: +${money(d.ingresos)}/−${money(d.egresos)} saldo ${money(d.saldo_acumulado)}`).join(' | '));

console.log('\n--- ROL: cajero NO ve flujo de caja ---');
const cfDenied = await j(await fetch(`${BASE}/api/reports/cash-flow`, { headers: H }));
console.log('Cajero flujo de caja   ->', cfDenied.status, cfDenied.d.error);
