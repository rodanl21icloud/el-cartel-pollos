// ============================================================
// Migración idempotente: columnas del Catálogo Virtual + formas de entrega.
// Añade a business_settings (catalog_slug, whatsapp, pickup_enabled,
// delivery_enabled) y a products (description, in_catalog) si faltan, y
// genera un slug por defecto desde Instagram/nombre.
//
// Local:       node --env-file=.env            scripts/migrate-catalog.mjs
// Producción:  node --env-file=.env.production scripts/migrate-catalog.mjs
// ============================================================
import { getDb } from '../src/db.js';

const db = getDb();
const cols = async (t) => (await db.execute(`PRAGMA table_info(${t})`)).rows.map((r) => r.name);

async function addIfMissing(table, name, ddl) {
  const have = await cols(table);
  if (have.includes(name)) { console.log(`  = ${table}.${name} ya existe`); return; }
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`  + ${table}.${name} agregada`);
}

console.log('Migrando columnas de catálogo…');
await addIfMissing('business_settings', 'catalog_slug', 'catalog_slug TEXT');
await addIfMissing('business_settings', 'whatsapp', 'whatsapp TEXT');
await addIfMissing('business_settings', 'pickup_enabled', 'pickup_enabled INTEGER NOT NULL DEFAULT 1');
await addIfMissing('business_settings', 'delivery_enabled', 'delivery_enabled INTEGER NOT NULL DEFAULT 1');
await addIfMissing('products', 'description', 'description TEXT');
await addIfMissing('products', 'in_catalog', 'in_catalog INTEGER NOT NULL DEFAULT 1');

// Slug por defecto desde @instagram o el nombre del negocio.
const bs = (await db.execute('SELECT name, instagram, catalog_slug FROM business_settings WHERE id=1')).rows[0];
if (bs && !bs.catalog_slug) {
  const base = (bs.instagram || bs.name || 'mi-negocio')
    .toLowerCase().replace(/^@/, '').replace(/\.cl$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  await db.execute({ sql: 'UPDATE business_settings SET catalog_slug=? WHERE id=1', args: [base] });
  console.log(`  slug por defecto: ${base}`);
}

console.log('✓ Listo.');
