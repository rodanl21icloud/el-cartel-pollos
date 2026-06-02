// ============================================================
// Migración de datos: base LOCAL (file:local-dev.db) -> Turso (producción).
// Copia verbatim las tablas de negocio preservando los IDs.
//   - Salta audit_logs (append-only) y las tablas de caja (solo había una
//     sesión OPEN de prueba; se omiten para no bloquear la apertura de caja).
//   - Tras copiar, fija las credenciales seguras de 'gerente' (la clave y el
//     OTP que ya tienes), para que el login de producción siga funcionando.
//
// Uso:  node --env-file=.env.production scripts/migrate-to-prod.mjs
// ============================================================
import { createClient } from '@libsql/client';
import bcrypt from 'bcryptjs';

// Credenciales de gerencia SOLO por entorno (nunca hardcodeadas en el repo).
// Si se entregan, se restituyen tras la copia para no romper el login.
const PROD_PASSWORD = process.env.ADMIN_PASSWORD || null;
const PROD_OTP = process.env.ADMIN_OTP || null;

if (!process.env.TURSO_DATABASE_URL || !/turso\.io|libsql:\/\//.test(process.env.TURSO_DATABASE_URL)) {
  console.error('✗ TURSO_DATABASE_URL debe apuntar a la base REMOTA (usa .env.production).');
  process.exit(1);
}

const source = createClient({ url: 'file:local-dev.db' });
const dest = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

// Orden padre -> hijo (respeta las FKs al insertar).
const TABLES = [
  'users',
  'role_permissions',
  'business_settings',
  'expense_categories',
  'ingredients',
  'products',
  'clients',
  'product_recipes',
  'sales',
  'sale_items',
  'expenses',
  'inventory_adjustments',
  'bank_movements',
];

const cols = async (db, t) => (await db.execute(`PRAGMA table_info(${t})`)).rows.map((r) => r.name);

// Limpieza COMPLETA en orden hijo -> padre (respeta FKs). Incluye las tablas
// de caja de prueba para poder reemplazar usuarios. Se omite audit_logs
// (append-only) que conserva su propia traza.
const WIPE = [
  'sale_items', 'inventory_adjustments', 'cash_movements', 'cash_register_closures',
  'expenses', 'sales', 'cash_sessions', 'product_modifier_groups', 'product_recipes',
  'modifier_options', 'modifier_groups', 'clients', 'bank_movements', 'products',
  'ingredients', 'expense_categories', 'business_settings', 'role_permissions', 'users',
];

console.log('Limpiando datos demo/prueba en producción…');
for (const t of WIPE) {
  await dest.execute(`DELETE FROM ${t}`);
}

console.log('Copiando tablas (local -> producción):');
let totalRows = 0;
for (const t of TABLES) {
  const srcCols = await cols(source, t);
  const dstCols = new Set(await cols(dest, t));
  const use = srcCols.filter((c) => dstCols.has(c));
  const list = use.map((c) => `"${c}"`).join(',');
  const rows = (await source.execute(`SELECT ${list} FROM ${t}`)).rows;
  if (!rows.length) { console.log(`  ${t.padEnd(22)} 0`); continue; }

  const sql = `INSERT INTO ${t} (${list}) VALUES (${use.map(() => '?').join(',')})`;
  const stmts = rows.map((r) => ({ sql, args: use.map((c) => (r[c] === undefined ? null : r[c])) }));
  for (let i = 0; i < stmts.length; i += 200) await dest.batch(stmts.slice(i, i + 200), 'write');
  totalRows += rows.length;
  console.log(`  ${t.padEnd(22)} ${rows.length}`);
}

// Restituir credenciales de gerencia (solo si se entregan por entorno).
if (PROD_PASSWORD && PROD_OTP) {
  const hash = await bcrypt.hash(PROD_PASSWORD, 10);
  await dest.execute({
    sql: `UPDATE users SET password_hash=?, otp_secret=? WHERE username='gerente'`,
    args: [hash, PROD_OTP],
  });
  console.log('  Credenciales de gerencia restituidas desde el entorno.');
} else {
  console.log('  (ADMIN_PASSWORD/ADMIN_OTP no provistos: se conservan las credenciales copiadas).');
}

console.log(`\n✓ Migración completa: ${totalRows} filas en ${TABLES.length} tablas.`);
