// P&L: venta (descuenta BOM con costo congelado) + merma + gastos -> utilidad.
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
const ge = await j(await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'gerente', password: 'gerente123' }),
}));
const { token, session } = lg.d;
const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
const GH = { 'Content-Type': 'application/json', Authorization: `Bearer ${ge.d.token}` };

// 3 combos vendidos. Costo BOM por combo: 1 pollo($3500) + 600g papas(600×$2=$1200) + 1 empaque($150) = $4850.
const p = { client_uuid: crypto.randomUUID(), payment_method: 'EFECTIVO', sold_at: new Date().toISOString(),
  items: [{ product_id: 'prod-combo-fam', qty: 3 }] };
const h = crypto.createHmac('sha256', Buffer.from(session.key, 'hex')).update(canon(p)).digest('hex');
const sale = await j(await fetch(`${BASE}/api/sales/sync`, { method: 'POST', headers: H, body: JSON.stringify({ payload: p, sessionId: session.id, hash: h }) }));
console.log('Venta 3 combos:', money(sale.d.total), '(esperado $56.970)');

// Merma: 1 pollo en mal estado (costo $3.500)
await j(await fetch(`${BASE}/api/inventory/merma`, { method: 'POST', headers: H,
  body: JSON.stringify({ ingredient_id: 'ing-pollo', qty: 1, reason: 'Mal estado' }) }));
console.log('Merma: 1 pollo ($3.500)');

// Gasto operativo (arriendo) y un retiro de socio
await j(await fetch(`${BASE}/api/expenses`, { method: 'POST', headers: H,
  body: JSON.stringify({ category_id: 'cat-arriendo', amount: 10000, payment_method: 'TRANSFERENCIA', description: 'Internet' }) }));
await j(await fetch(`${BASE}/api/expenses`, { method: 'POST', headers: H,
  body: JSON.stringify({ category_id: 'cat-retiros', amount: 8000, payment_method: 'EFECTIVO', description: 'Retiro socio' }) }));
console.log('Gasto operativo $10.000 (arriendo) + Retiro $8.000');

const pnl = (await j(await fetch(`${BASE}/api/reports/pnl`, { headers: GH }))).d;
console.log('\n========== ESTADO DE RESULTADOS (P&L) ==========');
console.log('Ventas                :', money(pnl.ventas));
console.log('− Costo insumos (BOM) :', money(pnl.costo_insumos), `(${pnl.margenes.food_cost_pct}% food cost)`);
console.log('= Utilidad bruta      :', money(pnl.utilidad_bruta), `(${pnl.margenes.utilidad_bruta_pct}%)`);
console.log('− Mermas              :', money(pnl.mermas), `(${pnl.margenes.merma_pct}%)`);
console.log('− Gastos operativos   :', money(pnl.gastos_operativos), pnl.gastos_por_categoria.map(g => `[${g.categoria} ${money(g.monto)}]`).join(' '));
console.log('= Utilidad operativa  :', money(pnl.utilidad_operativa), `(${pnl.margenes.utilidad_operativa_pct}%)`);
console.log('− Retiros de socios   :', money(pnl.retiros));
console.log('= Después de retiros  :', money(pnl.utilidad_despues_retiros));

// Validación aritmética
const okCogs = pnl.costo_insumos === 14550;   // 3 × $4.850
const okBruta = pnl.utilidad_bruta === pnl.ventas - pnl.costo_insumos;
const okOper = pnl.utilidad_operativa === Math.round((pnl.utilidad_bruta - pnl.mermas - pnl.gastos_operativos) * 100) / 100;
console.log('\nValidación: COGS=$14.550?', okCogs, '| bruta ok?', okBruta, '| operativa ok?', okOper);
