// Idempotente — teléfono para notificar al cliente por WhatsApp cuando el pedido esté listo.
//   node --env-file=.env            scripts/migrate-notify.mjs
//   node --env-file=.env.production scripts/migrate-notify.mjs
import { getDb } from '../src/db.js';
const db = getDb();
const cols = (await db.execute(`PRAGMA table_info(sales)`)).rows.map((r) => r.name);
if (cols.includes('notify_phone')) console.log('= sales.notify_phone ya existe');
else { await db.execute(`ALTER TABLE sales ADD COLUMN notify_phone TEXT`); console.log('✓ sales.notify_phone agregada'); }
console.log('Listo — notify.');
