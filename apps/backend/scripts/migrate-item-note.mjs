// Idempotente: agrega sale_items.note (nota por ítem de venta).
//   node --env-file=.env            scripts/migrate-item-note.mjs
//   node --env-file=.env.production scripts/migrate-item-note.mjs
import { getDb } from '../src/db.js';

const db = getDb();
const cols = (await db.execute(`PRAGMA table_info(sale_items)`)).rows.map((r) => r.name);
if (cols.includes('note')) { console.log('= sale_items.note ya existe'); process.exit(0); }
await db.execute(`ALTER TABLE sale_items ADD COLUMN note TEXT`);
console.log('✓ sale_items.note agregada');
