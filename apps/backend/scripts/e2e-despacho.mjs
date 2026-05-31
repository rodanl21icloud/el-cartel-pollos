// Número de orden correlativo + tablero de despacho con estados.
import crypto from 'node:crypto';
const BASE = 'http://localhost:3000';
const money = (n) => '$' + Number(n).toLocaleString('es-CL');
const canon = (v) => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : (v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v));
const j = async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) });

const lg = await j(await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'cajero1', password: 'cajero123' }),
}));
const { token, session } = lg.d;
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

async function vender(qty) {
  const p = { client_uuid: crypto.randomUUID(), payment_method: 'EFECTIVO', sold_at: new Date().toISOString(), items: [{ product_id: 'prod-combo-fam', qty }] };
  const h = crypto.createHmac('sha256', Buffer.from(session.key, 'hex')).update(canon(p)).digest('hex');
  return (await j(await fetch(`${BASE}/api/sales/sync`, { method: 'POST', headers: H, body: JSON.stringify({ payload: p, sessionId: session.id, hash: h }) }))).d;
}

console.log('--- NÚMERO DE ORDEN CORRELATIVO ---');
const v1 = await vender(1); const v2 = await vender(2); const v3 = await vender(1);
console.log('Venta 1 -> N°', v1.order_number, '| Venta 2 -> N°', v2.order_number, '| Venta 3 -> N°', v3.order_number);

console.log('\n--- TABLERO DE DESPACHO ---');
let board = (await j(await fetch(`${BASE}/api/dispatch`, { headers: H }))).d;
console.log('Día', board.day, '| pedidos:', board.orders.length, '| pendientes:', board.counts.PENDIENTE);
board.orders.forEach(o => console.log(`  #${o.order_number} [${o.status}] ${o.detalle} ${money(o.total)}`));

console.log('\n--- AVANZAR ESTADOS del pedido #1 ---');
for (const st of ['EN_PREPARACION', 'LISTO', 'ENTREGADO']) {
  const r = await j(await fetch(`${BASE}/api/dispatch/${v1.sale_id}/status`, { method: 'PUT', headers: H, body: JSON.stringify({ status: st }) }));
  console.log('  ->', st, '=>', r.status);
}
board = (await j(await fetch(`${BASE}/api/dispatch`, { headers: H }))).d;
console.log('Conteo final:', JSON.stringify(board.counts));

console.log('\n--- IDEMPOTENCIA: reintento conserva el mismo N° ---');
const dupPayload = { client_uuid: 'fixed-uuid-test', payment_method: 'EFECTIVO', sold_at: new Date().toISOString(), items: [{ product_id: 'prod-combo-fam', qty: 1 }] };
const dh = crypto.createHmac('sha256', Buffer.from(session.key, 'hex')).update(canon(dupPayload)).digest('hex');
const first = (await j(await fetch(`${BASE}/api/sales/sync`, { method: 'POST', headers: H, body: JSON.stringify({ payload: dupPayload, sessionId: session.id, hash: dh }) }))).d;
const retry = (await j(await fetch(`${BASE}/api/sales/sync`, { method: 'POST', headers: H, body: JSON.stringify({ payload: dupPayload, sessionId: session.id, hash: dh }) }))).d;
console.log('Primera N°', first.order_number, '(', first.status, ') | Reintento N°', retry.order_number, '(', retry.status, ')',
  first.order_number === retry.order_number ? '✓ mismo número' : '✗');
