// Prueba: mermas + alertas de stock + guard OTP de gerencia + reportes.
import { authenticator } from 'otplib';
import { getDb } from '../src/db.js';

const BASE = 'http://localhost:3000';
async function j(res) { const d = await res.json().catch(() => ({})); return { status: res.status, d }; }
const money = (n) => '$' + Number(n).toLocaleString('es-CL');

async function login(username, password) {
  const { d } = await j(await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }));
  return d.token;
}
const H = (token, otp) => {
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  if (otp) h['x-management-otp'] = otp;
  return h;
};

const cajero = await login('cajero1', 'cajero123');
const gerente = await login('gerente', 'gerente123');
const db = getDb();
const pollo = (await db.execute("SELECT id, stock_qty FROM ingredients WHERE name='Pollo'")).rows[0];
const otpSecret = (await db.execute("SELECT otp_secret FROM users WHERE role='GERENCIA'")).rows[0].otp_secret;

console.log('--- MERMAS ---');
// 1) Merma sin justificación -> rechazo
const m1 = await j(await fetch(`${BASE}/api/inventory/merma`, {
  method: 'POST', headers: H(cajero), body: JSON.stringify({ ingredient_id: pollo.id, qty: 2, reason: '' }),
}));
console.log('Merma sin reason ->', m1.status, m1.d.error);

// 2) Merma válida (3 pollos por mal estado)
const m2 = await j(await fetch(`${BASE}/api/inventory/merma`, {
  method: 'POST', headers: H(cajero),
  body: JSON.stringify({ ingredient_id: pollo.id, qty: 3, reason: 'Pollos en mal estado' }),
}));
console.log('Merma válida     ->', m2.status, `Pollo ${pollo.stock_qty} -> ${m2.d.new_stock}`);

console.log('\n--- GUARD OTP (PUT producto) ---');
const prod = (await db.execute("SELECT id FROM products LIMIT 1")).rows[0];
// 3) Cajero sin OTP -> 403
const p1 = await j(await fetch(`${BASE}/api/products/${prod.id}`, {
  method: 'PUT', headers: H(cajero), body: JSON.stringify({ price: 19990 }),
}));
console.log('Cajero sin OTP   ->', p1.status, p1.d.error);

// 4) Cajero con OTP de gerencia -> 200
const p2 = await j(await fetch(`${BASE}/api/products/${prod.id}`, {
  method: 'PUT', headers: H(cajero, authenticator.generate(otpSecret)),
  body: JSON.stringify({ price: 19990 }),
}));
console.log('Cajero + OTP     ->', p2.status, p2.d.price ? money(p2.d.price) : p2.d.error);

// 5) Cajero con OTP inválido -> 403
const p3 = await j(await fetch(`${BASE}/api/products/${prod.id}`, {
  method: 'PUT', headers: H(cajero, '000000'), body: JSON.stringify({ price: 21000 }),
}));
console.log('Cajero OTP malo  ->', p3.status, p3.d.error);

// 6) Gerencia directo (sin OTP) -> 200
const p4 = await j(await fetch(`${BASE}/api/products/${prod.id}`, {
  method: 'PUT', headers: H(gerente), body: JSON.stringify({ price: 18990 }),
}));
console.log('Gerencia directo ->', p4.status, p4.d.price ? money(p4.d.price) : p4.d.error);

console.log('\n--- ROLES EN REPORTES ---');
// 7) Cajero NO puede ver reportes (revela teórico)
const r1 = await j(await fetch(`${BASE}/api/reports/turn-summary`, { headers: H(cajero) }));
console.log('Cajero reportes  ->', r1.status, r1.d.error);
// 8) Gerencia sí
const r2 = await j(await fetch(`${BASE}/api/reports/turn-summary`, { headers: H(gerente) }));
console.log('Gerencia reportes->', r2.status, 'total turno', money(r2.d.total),
  '| top:', r2.d.top_products.map(p => `${p.name} x${p.unidades}`).join(', '));

console.log('\n--- ALERTAS DE STOCK ---');
// Forzar alerta: subir el umbral del Pollo por encima del stock
await db.execute({ sql: "UPDATE ingredients SET min_stock_qty = 999 WHERE name='Pollo'", args: [] });
const a = await j(await fetch(`${BASE}/api/inventory/alerts`, { headers: H(cajero) }));
console.log('Alertas stock    ->', a.status, `${a.d.count} insumo(s):`,
  a.d.alerts.map(x => `${x.name}(${x.stock_qty}/${x.min_stock_qty})`).join(', '));
await db.execute({ sql: "UPDATE ingredients SET min_stock_qty = 20 WHERE name='Pollo'", args: [] });

console.log('\n--- AUDITORÍA ---');
const audit = await db.execute("SELECT action, COUNT(*) c FROM audit_logs GROUP BY action ORDER BY action");
console.log(audit.rows.map(r => `${r.action}:${r.c}`).join(', '));
