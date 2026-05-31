// Carta + recetas con decimales: crear producto, armar receta (medio pollo),
// leer costo, vender y verificar el descuento decimal del inventario.
import crypto from 'node:crypto';
const BASE = 'http://localhost:3000';
const money = (n) => '$' + Number(n).toLocaleString('es-CL');
const canon = (v) => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : (v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v));
const j = async (r) => ({ status: r.status, d: await r.json().catch(() => ({})) });

const lg = await j(await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'gerente', password: 'gerente123' }),
}));
const { token, session } = lg.d;
const GH = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

const c = await j(await fetch(`${BASE}/api/products`, {
  method: 'POST', headers: GH, body: JSON.stringify({ name: 'Medio Pollo', price: 6990, category: 'INDIVIDUAL' }),
}));
console.log('Crear producto ->', c.status, c.d.name, c.d.sku, money(c.d.price));
const pid = c.d.id;

const rec = await j(await fetch(`${BASE}/api/products/${pid}/recipe`, {
  method: 'PUT', headers: GH, body: JSON.stringify({ lines: [
    { ingredient_id: 'ing-pollo', qty_per_unit: 0.5 },
    { ingredient_id: 'ing-papas', qty_per_unit: 300 },
    { ingredient_id: 'ing-empaque', qty_per_unit: 1 },
  ] }),
}));
console.log('Set receta (decimales) ->', rec.status, rec.d.lines, 'líneas');

const get = await j(await fetch(`${BASE}/api/products/${pid}/recipe`, { headers: GH }));
console.log('Receta:', get.d.lines.map(l => `${l.ingredient}=${l.qty_per_unit}${l.unit[0]}`).join(', '),
  '| costo insumos', money(get.d.costo_insumos), '(esperado $2.500)');

const ingA = (await j(await fetch(`${BASE}/api/inventory/ingredients`, { headers: GH }))).d.find(i => i.id === 'ing-pollo').stock_qty;
const p = { client_uuid: crypto.randomUUID(), payment_method: 'EFECTIVO', sold_at: new Date().toISOString(), items: [{ product_id: pid, qty: 1 }] };
const h = crypto.createHmac('sha256', Buffer.from(session.key, 'hex')).update(canon(p)).digest('hex');
const sale = await j(await fetch(`${BASE}/api/sales/sync`, { method: 'POST', headers: GH, body: JSON.stringify({ payload: p, sessionId: session.id, hash: h }) }));
const ingB = (await j(await fetch(`${BASE}/api/inventory/ingredients`, { headers: GH }))).d.find(i => i.id === 'ing-pollo').stock_qty;
console.log('Venta 1 Medio Pollo ->', sale.status, '| Pollo:', ingA, '->', ingB, `(descontó ${ingA - ingB} = medio pollo ${ingA - ingB === 0.5 ? '✓' : '✗'})`);

// Validación de receta: insumo duplicado y cantidad 0
const dup = await j(await fetch(`${BASE}/api/products/${pid}/recipe`, {
  method: 'PUT', headers: GH, body: JSON.stringify({ lines: [
    { ingredient_id: 'ing-pollo', qty_per_unit: 1 }, { ingredient_id: 'ing-pollo', qty_per_unit: 2 },
  ] }),
}));
console.log('Receta con duplicado ->', dup.status, dup.d.error);
const zero = await j(await fetch(`${BASE}/api/products/${pid}/recipe`, {
  method: 'PUT', headers: GH, body: JSON.stringify({ lines: [{ ingredient_id: 'ing-pollo', qty_per_unit: 0 }] }),
}));
console.log('Receta con qty 0 ->', zero.status, zero.d.error);
