// ============================================================
// SMOKE TEST POST-DEPLOY — correr después de CADA salida a producción.
//   node --env-file=.env.production scripts/smoke-prod.mjs
// Verifica: endpoints públicos vivos, login responde, integridad de esquema
// (las columnas/tablas que han roto la operación) y el ciclo de clave de sesión.
// Sale con código !=0 si algo falla.  SMOKE_URL para apuntar a otra URL.
// ============================================================
import { getDb } from '../src/db.js';
import { issueSessionKey, getSessionKey } from '../src/services/sessionKeys.js';

const BASE = process.env.SMOKE_URL || 'https://cartel-pollos.onrender.com';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

async function http(method, path, expect, body) {
  try {
    const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    ok(r.status === expect, `${method} ${path} → ${r.status} (esperado ${expect})`);
  } catch (e) { ok(false, `${method} ${path} ERROR ${e.message}`); }
}

console.log(`SMOKE ${BASE}\n— HTTP —`);
await http('GET', '/api/public/reviews', 200);
await http('GET', '/api/public/catalog/elcarteldelospollos', 200);
await http('POST', '/api/auth/login', 401, { username: '__smoke__', password: '__nope__' }); // credenciales falsas
await http('GET', '/api/sales', 401); // sin token → protegido

console.log('— Esquema —');
const db = getDb();
const tables = new Set((await db.execute(`SELECT name FROM sqlite_master WHERE type='table'`)).rows.map((r) => r.name));
for (const t of ['users', 'role_permissions', 'business_settings', 'products', 'ingredients', 'product_recipes',
  'sales', 'sale_items', 'expenses', 'expense_categories', 'cash_sessions', 'cash_register_closures', 'cash_movements',
  'inventory_adjustments', 'bank_movements', 'audit_logs', 'session_keys', 'campaigns', 'loyalty_accounts',
  'loyalty_transactions', 'operational_day', 'ops_task', 'ops_config', 'tax_config', 'cash_policy_settings']) ok(tables.has(t), `tabla ${t}`);

const cols = async (t) => new Set((await db.execute(`PRAGMA table_info(${t})`)).rows.map((r) => r.name));
const sc = await cols('sales');
ok(sc.has('notify_phone'), 'sales.notify_phone');
ok(sc.has('business_day') && sc.has('dispatch_status'), 'sales: business_day + dispatch_status');
const sk = await cols('session_keys');
ok(sk.has('id') && sk.has('key') && sk.has('user_id') && sk.has('expires_at'), 'session_keys estructura correcta (id/key/user_id/expires_at)');
ok(Number((await db.execute(`SELECT COUNT(*) n FROM expense_categories WHERE is_active=1`)).rows[0].n) > 0, 'expense_categories activas > 0');
ok(Number((await db.execute(`SELECT COUNT(*) n FROM users WHERE is_active=1`)).rows[0].n) > 0, 'usuarios activos > 0');
const unitDef = (await db.execute(`SELECT sql FROM sqlite_master WHERE name='ingredients'`)).rows[0].sql;
ok(/'kilo'/.test(unitDef) && /'onza'/.test(unitDef), 'ingredients.unit soporta kilo/onza');

console.log('— Sesión HMAC —');
try {
  const u = (await db.execute(`SELECT id FROM users WHERE is_active=1 LIMIT 1`)).rows[0].id;
  const { sessionId, key } = await issueSessionKey(u);
  const back = await getSessionKey(sessionId, u);
  await db.execute({ sql: `DELETE FROM session_keys WHERE id=?`, args: [sessionId] });
  ok(back === key, 'emite y recupera clave de sesión (login firmará ventas)');
} catch (e) { ok(false, 'clave de sesión: ' + e.message); }

console.log(`\nRESULTADO: ${pass} OK · ${fail} fallo(s)`);
process.exit(fail ? 1 : 0);
