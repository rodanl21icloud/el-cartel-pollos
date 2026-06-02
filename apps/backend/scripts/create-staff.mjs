// ============================================================
// Crea/actualiza cuentas reales de operación: una de CAJA (cajero) y una de
// COCINA (preparador), con contraseñas fuertes. Desactiva las cuentas demo
// (cajero1, prep1). Imprime las credenciales UNA vez.
//
// Local:       node --env-file=.env            scripts/create-staff.mjs
// Producción:  node --env-file=.env.production scripts/create-staff.mjs
//
// Opcional: define CAJA_PASSWORD / COCINA_PASSWORD para fijar las claves.
// ============================================================
import { randomUUID, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb } from '../src/db.js';

const db = getDb();
const strong = () => randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) + 'k7';

const staff = [
  { username: 'caja', full_name: 'Caja', role: 'CAJERO', pass: process.env.CAJA_PASSWORD || strong() },
  { username: 'cocina', full_name: 'Cocina', role: 'PREPARADOR', pass: process.env.COCINA_PASSWORD || strong() },
];

for (const u of staff) {
  const hash = await bcrypt.hash(u.pass, 10);
  await db.execute({
    sql: `INSERT INTO users (id, username, password_hash, full_name, role, is_active)
          VALUES (?,?,?,?,?,1)
          ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash, full_name=excluded.full_name, role=excluded.role, is_active=1`,
    args: [randomUUID(), u.username, hash, u.full_name, u.role],
  });
}

// Desactivar cuentas demo (no se borran para preservar el historial referenciado).
await db.execute({ sql: `UPDATE users SET is_active=0 WHERE username IN ('cajero1','prep1') AND role <> 'GERENCIA'`, args: [] });

console.log('\n========================================================');
console.log(' CUENTAS DE OPERACIÓN');
console.log('========================================================');
for (const u of staff) console.log(` ${u.role.padEnd(11)} usuario: ${u.username.padEnd(8)} clave: ${u.pass}`);
console.log('--------------------------------------------------------');
console.log(' Cuentas demo cajero1/prep1: DESACTIVADAS.');
console.log(' Puedes cambiar nombres/claves o crear más en la pantalla Usuarios.');
console.log('========================================================\n');
