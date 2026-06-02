// ============================================================
// Reconstruye users y role_permissions para QUITAR el CHECK rígido de `role`
// (permite roles extensibles del catálogo src/config/roles.js).
// Idempotente: si la tabla ya no tiene el CHECK, no hace nada.
// Preserva todos los datos. Tras correr, ejecuta migrate-perms.mjs.
//
// Local:       node --env-file=.env            scripts/migrate-roles.mjs
// Producción:  node --env-file=.env.production scripts/migrate-roles.mjs
// ============================================================
import { getDb } from '../src/db.js';

const db = getDb();
const ddlOf = async (t) => (await db.execute({ sql: `SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, args: [t] })).rows[0]?.sql || '';

async function rebuildRolePermissions() {
  if (!/CHECK\s*\(\s*role/i.test(await ddlOf('role_permissions'))) { console.log('= role_permissions ya sin CHECK'); return; }
  await db.execute(`CREATE TABLE role_permissions_new (
    role TEXT NOT NULL, permission TEXT NOT NULL,
    allowed INTEGER NOT NULL DEFAULT 0 CHECK (allowed IN (0,1)),
    PRIMARY KEY (role, permission))`);
  await db.execute(`INSERT INTO role_permissions_new (role, permission, allowed) SELECT role, permission, allowed FROM role_permissions`);
  await db.execute(`DROP TABLE role_permissions`);
  await db.execute(`ALTER TABLE role_permissions_new RENAME TO role_permissions`);
  console.log('+ role_permissions reconstruida (sin CHECK)');
}

async function rebuildUsers() {
  if (!/CHECK\s*\(\s*role/i.test(await ddlOf('users'))) { console.log('= users ya sin CHECK'); return; }
  // FK off para poder reemplazar la tabla referenciada por ventas/gastos/etc.
  await db.execute(`PRAGMA foreign_keys=OFF`);
  await db.execute(`CREATE TABLE users_new (
    id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL, role TEXT NOT NULL, otp_secret TEXT,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await db.execute(`INSERT INTO users_new (id, username, password_hash, full_name, role, otp_secret, is_active, created_at, updated_at)
                    SELECT id, username, password_hash, full_name, role, otp_secret, is_active, created_at, updated_at FROM users`);
  await db.execute(`DROP TABLE users`);
  await db.execute(`ALTER TABLE users_new RENAME TO users`);
  await db.execute(`PRAGMA foreign_keys=ON`);
  console.log('+ users reconstruida (sin CHECK)');
}

await rebuildRolePermissions(); // seguro: role_permissions no tiene FKs entrantes

// users tiene FKs entrantes (ventas, gastos, etc.). Si el backend no permite
// PRAGMA foreign_keys=OFF (algunos entornos remotos), no abortamos: la matriz
// ya quedó lista y createUser degrada con ROL_NO_DISPONIBLE hasta reconstruir.
try {
  await rebuildUsers();
} catch (e) {
  console.warn('⚠ No se pudo reconstruir users (CHECK sigue):', e.message);
  console.warn('  El sistema funciona con los roles existentes; crear roles nuevos dará ROL_NO_DISPONIBLE.');
  console.warn('  Reintenta este script o reconstruye users en una ventana de mantenimiento.');
}

const fk = (await db.execute(`PRAGMA foreign_key_check`)).rows;
if (fk.length) console.warn('⚠ Violaciones de FK tras la migración:', fk.length);
else console.log('✓ Integridad FK ok.');
console.log('✓ Listo. Ahora corre scripts/migrate-perms.mjs para sembrar los nuevos roles.');
