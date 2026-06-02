// ============================================================
// Rellena combos (rol, permiso) faltantes en role_permissions a partir de
// DEFAULTS, sin sobrescribir lo ya configurado (INSERT OR IGNORE). Úsalo al
// agregar permisos nuevos al catálogo (ej. forecast.view).
//
// Local:       node --env-file=.env            scripts/migrate-perms.mjs
// Producción:  node --env-file=.env.production scripts/migrate-perms.mjs
// ============================================================
import { getDb } from '../src/db.js';
import { PERMISSIONS, DEFAULTS } from '../src/services/permissions.js';

const db = getDb();
const stmts = [];
for (const [role, keys] of Object.entries(DEFAULTS)) {
  for (const p of PERMISSIONS) {
    stmts.push({
      sql: `INSERT OR IGNORE INTO role_permissions (role, permission, allowed) VALUES (?,?,?)`,
      args: [role, p.key, keys.includes(p.key) ? 1 : 0],
    });
  }
}
await db.batch(stmts, 'write');

const rows = (await db.execute({ sql: `SELECT role, permission, allowed FROM role_permissions WHERE permission='forecast.view' ORDER BY role`, args: [] })).rows;
console.log('forecast.view por rol:');
for (const r of rows) console.log(`  ${r.role}: ${r.allowed ? 'sí' : 'no'}`);
console.log('✓ Permisos sincronizados.');
