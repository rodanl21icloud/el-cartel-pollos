// Helpers de test: aplicar esquema, sembrar usuarios, login y firma HMAC.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { getDb } from '../src/db.js';
import { canonicalize } from '../src/middleware/hmac.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Divide el schema.sql respetando bloques de trigger BEGIN...END.
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

export async function applySchema() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const db = getDb();
  for (const stmt of splitStatements(sql)) await db.execute(stmt);
}

export async function seedUsers() {
  const db = getDb();
  const users = [
    ['cajero1', 'cajero123', 'Cajero Uno', 'CAJERO', null],
    ['prep1', 'prep123', 'Preparador', 'PREPARADOR', null],
    ['gerente', 'gerente123', 'Gerencia', 'GERENCIA', 'JBSWY3DPEHPK3PXP'],
  ];
  for (const [u, p, n, r, otp] of users) {
    const hash = await bcrypt.hash(p, 4);
    await db.execute({
      sql: `INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, otp_secret) VALUES (?,?,?,?,?,?)`,
      args: [crypto.randomUUID(), u, hash, n, r, otp],
    });
  }
}

// App (importada después de fijar el entorno en setup.js).
export async function getApp() { return (await import('../src/index.js')).default; }

export async function login(app, username = 'gerente', password = 'gerente123') {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res.body; // { token, user, session }
}

// Firma un payload de venta igual que el frontend (HMAC-SHA256 con clave hex -> bytes).
export function signSale(payload, session) {
  const hash = crypto.createHmac('sha256', Buffer.from(session.key, 'hex'))
    .update(canonicalize(payload)).digest('hex');
  return { payload, sessionId: session.id, hash };
}

export const auth = (req, token) => req.set('Authorization', 'Bearer ' + token);
