// Crea usuarios de prueba con contraseñas hasheadas y un secreto OTP de gerencia.
// Uso: node scripts/seedUsers.js
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { getDb } from '../src/db.js';

const db = getDb();
const otpSecret = authenticator.generateSecret();

const users = [
  { username: 'cajero1',  pass: 'cajero123',  name: 'Cajero Uno',  role: 'CAJERO',     otp: null },
  { username: 'prep1',    pass: 'prep123',    name: 'Preparador',  role: 'PREPARADOR', otp: null },
  { username: 'gerente',  pass: 'gerente123', name: 'Gerencia',    role: 'GERENCIA',   otp: otpSecret },
];

for (const u of users) {
  const hash = await bcrypt.hash(u.pass, 10);
  await db.execute({
    sql: `INSERT INTO users (id, username, password_hash, full_name, role, otp_secret)
          VALUES (?,?,?,?,?,?)
          ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash`,
    args: [randomUUID(), u.username, hash, u.name, u.role, u.otp],
  });
  console.log(`Usuario: ${u.username} / ${u.pass} (${u.role})`);
}

console.log('\nOTP secret de GERENCIA (cárgalo en una app TOTP como Google Authenticator):');
console.log(otpSecret);
console.log('Código actual:', authenticator.generate(otpSecret));
