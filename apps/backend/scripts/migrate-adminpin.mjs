// Migración idempotente: columna admin_pin_hash en business_settings.
// Local:       node --env-file=.env            scripts/migrate-adminpin.mjs
// Producción:  node --env-file=.env.production scripts/migrate-adminpin.mjs
import { getDb } from '../src/db.js';

const db = getDb();
const cols = (await db.execute(`PRAGMA table_info(business_settings)`)).rows.map((r) => r.name);
if (cols.includes('admin_pin_hash')) {
  console.log('= business_settings.admin_pin_hash ya existe');
} else {
  await db.execute(`ALTER TABLE business_settings ADD COLUMN admin_pin_hash TEXT`);
  console.log('+ business_settings.admin_pin_hash agregada');
}
console.log('✓ Listo.');
