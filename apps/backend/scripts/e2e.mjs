// Prueba end-to-end del flujo: login -> productos -> venta firmada HMAC -> cierre ciego.
import crypto from 'node:crypto';
import { getDb } from '../src/db.js';

const BASE = 'http://localhost:3000';

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function j(res) { const d = await res.json().catch(() => ({})); return { status: res.status, d }; }
const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// 1) LOGIN
const login = await j(await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'cajero1', password: 'cajero123' }),
}));
const { token, session } = login.d;
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
console.log('1) LOGIN     ->', login.status, login.d.user.role);

// 2) PRODUCTOS
const prods = await j(await fetch(`${BASE}/api/products`, { headers: H }));
const combo = prods.d[0];
console.log('2) PRODUCTOS ->', prods.status, combo.name, money(combo.price));

// Stock antes
const db = getDb();
const before = await db.execute('SELECT name, stock_qty FROM ingredients ORDER BY name');
console.log('   Stock antes:', before.rows.map(r => `${r.name}=${r.stock_qty}`).join(', '));

// 3) VENTA firmada (2 combos, efectivo)
const payload = {
  client_uuid: crypto.randomUUID(),
  payment_method: 'EFECTIVO',
  sold_at: new Date().toISOString(),
  items: [{ product_id: combo.id, qty: 2 }],
};
const hash = crypto.createHmac('sha256', Buffer.from(session.key, 'hex')).update(canonicalize(payload)).digest('hex');
const sale = await j(await fetch(`${BASE}/api/sales/sync`, {
  method: 'POST', headers: H, body: JSON.stringify({ payload, sessionId: session.id, hash }),
}));
console.log('3) VENTA     ->', sale.status, sale.d.status, 'total', money(sale.d.total));

// 3b) Reintento idempotente (mismo client_uuid)
const dup = await j(await fetch(`${BASE}/api/sales/sync`, {
  method: 'POST', headers: H, body: JSON.stringify({ payload, sessionId: session.id, hash }),
}));
console.log('   Reintento  ->', dup.status, dup.d.status, '(idempotente)');

// 3c) Payload manipulado (cambia qty sin re-firmar)
const tampered = { ...payload, items: [{ product_id: combo.id, qty: 99 }] };
const tamper = await j(await fetch(`${BASE}/api/sales/sync`, {
  method: 'POST', headers: H, body: JSON.stringify({ payload: tampered, sessionId: session.id, hash }),
}));
console.log('   Tamper     ->', tamper.status, tamper.d.error, '(rechazado)');

// Stock después
const after = await db.execute('SELECT name, stock_qty FROM ingredients ORDER BY name');
console.log('   Stock desp:', after.rows.map(r => `${r.name}=${r.stock_qty}`).join(', '));

// 4) CIERRE CIEGO (declaro 30000 efectivo; teórico = 2*18990 = 37980 -> descuadre)
const close = await j(await fetch(`${BASE}/api/cash-register/close`, {
  method: 'POST', headers: H,
  body: JSON.stringify({ efectivo_declarado: 30000, pos_declarado: 0, transferencias_declaradas: 0 }),
}));
console.log('4) CIERRE    ->', close.status, 'descuadre:', close.d.descuadre,
  'diff_efectivo', money(close.d.diferencias.efectivo));

// 5) Auditoría: cuántos eventos quedaron
const audit = await db.execute("SELECT action, COUNT(*) c FROM audit_logs GROUP BY action ORDER BY action");
console.log('5) AUDIT     ->', audit.rows.map(r => `${r.action}:${r.c}`).join(', '));
