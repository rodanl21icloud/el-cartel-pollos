// ============================================================
// Provisión de la base de datos de PRODUCCIÓN (Turso).
//   1. Aplica schema.sql (tablas, triggers, índices).
//   2. Aplica seed.sql (categorías de gasto, datos del negocio, insumos demo).
//   3. Crea un usuario GERENCIA con contraseña fuerte y secreto OTP (TOTP).
//
// Uso (con las variables de Turso en el entorno o en un archivo .env):
//   node --env-file=.env.production scripts/provision.mjs
//
// Variables opcionales:
//   ADMIN_USER      (def. 'gerente')
//   ADMIN_PASSWORD  (si no se entrega, se genera una fuerte y se imprime)
//   WITH_DEMO=1     (además, siembra carta + recetas reales si existen los scripts)
// ============================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { getDb } from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..', 'db');

if (!process.env.TURSO_DATABASE_URL) {
  console.error('✗ Falta TURSO_DATABASE_URL. Define las variables de Turso (ver DEPLOY.md).');
  process.exit(1);
}

function splitStatements(sql) {
  const out = []; let buf = ''; let inBlock = false;
  for (const raw of sql.split('\n')) {
    const line = raw.replace(/--.*$/, '');
    if (/\bBEGIN\b/i.test(line)) inBlock = true;
    buf += raw + '\n';
    if (inBlock) { if (/\bEND\s*;/i.test(line)) { out.push(buf.trim()); buf = ''; inBlock = false; } }
    else if (/;\s*$/.test(line)) { out.push(buf.trim()); buf = ''; }
  }
  return out.filter((s) => s.replace(/;/g, '').trim().length);
}

const db = getDb();
async function apply(file) {
  const sql = readFileSync(join(dbDir, file), 'utf8');
  for (const stmt of splitStatements(sql)) await db.execute(stmt);
  console.log(`✓ Aplicado ${file}`);
}

// Contraseña fuerte legible si no se entrega una.
function strongPassword() {
  return randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) + 'A9';
}

await apply('schema.sql');
await apply('seed.sql');

const username = (process.env.ADMIN_USER || 'gerente').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || strongPassword();
const otp = authenticator.generateSecret();
const hash = await bcrypt.hash(password, 10);

await db.execute({
  sql: `INSERT INTO users (id, username, password_hash, full_name, role, otp_secret)
        VALUES (?,?,?,?, 'GERENCIA', ?)
        ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash, otp_secret=excluded.otp_secret`,
  args: [randomUUID(), username, hash, 'Gerencia', otp],
});

const issuer = 'El Cartel de los Pollos';
const otpauth = authenticator.keyuri(username, issuer, otp);

console.log('\n========================================================');
console.log(' USUARIO GERENCIA CREADO');
console.log('========================================================');
console.log(` Usuario:     ${username}`);
console.log(` Contraseña:  ${password}`);
console.log('\n OTP (TOTP) — cárgalo en Google Authenticator / Authy:');
console.log(`   Secreto:   ${otp}`);
console.log(`   Código:    ${authenticator.generate(otp)} (válido ~30s)`);
console.log(`   otpauth:   ${otpauth}`);
console.log('========================================================');
console.log('\n⚠  Guarda estos datos AHORA. La contraseña no se vuelve a mostrar.');
console.log('   Cambia la contraseña tras el primer ingreso si lo deseas.\n');
