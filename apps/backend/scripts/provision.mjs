// ============================================================
// Provisión de la base de datos de una INSTANCIA (Turso o archivo local).
//   1. Aplica schema.sql (tablas, triggers, índices).
//   2. Siembra datos de referencia:
//        - por defecto: solo lo estructural (seed-core.sql) -> BASE VACÍA.
//        - con WITH_DEMO=1: además seed.sql (insumos/carta demo de El Cartel).
//   3. Fija los datos del negocio (business_settings) con BUSINESS_NAME.
//   4. Crea un usuario GERENCIA con contraseña fuerte y secreto OTP (TOTP).
//
// Uso para una instancia NUEVA y VACÍA (ej. otro local):
//   BUSINESS_NAME="El Pollo de la Tía" ADMIN_USER=gerente \
//     node --env-file=.env.pollo-tia scripts/provision.mjs
//
// Variables:
//   BUSINESS_NAME   nombre del local (def. 'El Cartel de los Pollos').
//                   Va en comprobantes, cartelera y el emisor del OTP.
//   ADMIN_USER      (def. 'gerente')
//   ADMIN_PASSWORD  (si no se entrega, se genera una fuerte y se imprime)
//   WITH_DEMO=1     siembra datos demo (solo para El Cartel / pruebas)
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

const BUSINESS_NAME = (process.env.BUSINESS_NAME || 'El Cartel de los Pollos').trim();

await apply('schema.sql');
// Base vacía por defecto (solo referencia); datos demo solo con WITH_DEMO=1.
if (process.env.WITH_DEMO === '1') await apply('seed.sql');
else await apply('seed-core.sql');

// Datos del negocio: BUSINESS_NAME manda (sobre-escribe el de seed.sql si lo hubo).
await db.execute({
  sql: `INSERT INTO business_settings (id, name, paper_width)
        VALUES (1, ?, 80)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
  args: [BUSINESS_NAME],
});

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

const otpauth = authenticator.keyuri(username, BUSINESS_NAME, otp);

console.log('\n========================================================');
console.log(` INSTANCIA PROVISIONADA — ${BUSINESS_NAME}`);
console.log(`   ${process.env.WITH_DEMO === '1' ? 'con datos demo' : 'base vacía (sin transacciones ni demo)'}`);
console.log('========================================================');
console.log(' USUARIO GERENCIA');
console.log(` Usuario:     ${username}`);
console.log(` Contraseña:  ${password}`);
console.log('\n OTP (TOTP) — cárgalo en Google Authenticator / Authy:');
console.log(`   Secreto:   ${otp}`);
console.log(`   Código:    ${authenticator.generate(otp)} (válido ~30s)`);
console.log(`   otpauth:   ${otpauth}`);
console.log('========================================================');
console.log('\n⚠  Guarda estos datos AHORA. La contraseña no se vuelve a mostrar.');
console.log('   Cambia la contraseña tras el primer ingreso si lo deseas.\n');
