// Migración aditiva: campos de producto estilo Treinta (cost, tax_rate, track_inventory).
// Idempotente: ignora "duplicate column". Seguro en producción.
//   node --env-file=.env.production scripts/migrate-product-treinta.mjs
import { getDb } from '../src/db.js';

const db = getDb();
const cols = [
  ['cost', 'REAL NOT NULL DEFAULT 0'],
  ['tax_rate', 'REAL NOT NULL DEFAULT 0'],
  ['track_inventory', 'INTEGER NOT NULL DEFAULT 0'],
];
for (const [name, type] of cols) {
  try {
    await db.execute(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
    console.log(`✓ products.${name} agregada`);
  } catch (e) {
    if (/duplicate column/i.test(String(e.message))) console.log(`= products.${name} ya existía`);
    else throw e;
  }
}
console.log('Listo.');
