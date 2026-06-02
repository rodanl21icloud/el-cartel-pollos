// ============================================================
// Fija el PIN de administrador (para ajustes de stock auditados).
// El PIN se pasa como argumento (no se hardcodea). 4 a 8 dígitos.
//
// Local:       node --env-file=.env            scripts/set-admin-pin.mjs 1234
// Producción:  node --env-file=.env.production scripts/set-admin-pin.mjs 1234
// ============================================================
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb } from '../src/db.js';

const pin = (process.argv[2] || process.env.ADMIN_PIN || '').trim();
if (!/^\d{4,8}$/.test(pin)) {
  console.error('✗ Uso: set-admin-pin.mjs <PIN 4-8 dígitos>');
  process.exit(1);
}

const db = getDb();
const hash = await bcrypt.hash(pin, 10);
await db.execute({
  sql: `INSERT INTO business_settings (id, admin_pin_hash, updated_at) VALUES (1, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET admin_pin_hash = excluded.admin_pin_hash, updated_at = excluded.updated_at`,
  args: [hash],
});
// Traza en auditoría (evento de sistema).
await db.execute({
  sql: `INSERT INTO audit_logs (id, user_id, action, entity, severity, metadata)
        VALUES (?, NULL, 'ADMIN_PIN_SET', 'business_settings', 'WARN', ?)`,
  args: [randomUUID(), JSON.stringify({ via: 'script', note: 'PIN temporal' })],
});

console.log(`✓ PIN de administrador configurado (${pin.length} dígitos). Cámbialo desde Configuración cuando quieras.`);
