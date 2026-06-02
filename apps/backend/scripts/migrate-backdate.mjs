// Migración idempotente: columnas de venta retroactiva en sales.
// Local:       node --env-file=.env            scripts/migrate-backdate.mjs
// Producción:  node --env-file=.env.production scripts/migrate-backdate.mjs
import { getDb } from '../src/db.js';

const db = getDb();
const cols = (await db.execute(`PRAGMA table_info(sales)`)).rows.map((r) => r.name);
async function add(name, ddl) {
  if (cols.includes(name)) { console.log(`= sales.${name} ya existe`); return; }
  await db.execute(`ALTER TABLE sales ADD COLUMN ${ddl}`);
  console.log(`+ sales.${name} agregada`);
}
await add('is_backdated', 'is_backdated INTEGER NOT NULL DEFAULT 0');
await add('backdate_reason', 'backdate_reason TEXT');
console.log('✓ Listo.');
