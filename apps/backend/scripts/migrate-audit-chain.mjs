// Migración aditiva: cadena antifraude en audit_logs (prev_hash, record_hash).
// Idempotente. Los triggers append-only no se ven afectados (ADD COLUMN es legal,
// el INSERT sigue permitido). Las filas previas quedan con hash NULL (génesis).
//   node --env-file=.env.production scripts/migrate-audit-chain.mjs
import { getDb } from '../src/db.js';

const db = getDb();
for (const [name, type] of [['prev_hash', 'TEXT'], ['record_hash', 'TEXT']]) {
  try {
    await db.execute(`ALTER TABLE audit_logs ADD COLUMN ${name} ${type}`);
    console.log(`✓ audit_logs.${name} agregada`);
  } catch (e) {
    if (/duplicate column/i.test(String(e.message))) console.log(`= audit_logs.${name} ya existía`);
    else throw e;
  }
}
console.log('Listo.');
