// Migración idempotente: conteo operativo de horno/insumos en apertura y cierre.
// Agrega columnas con ALTER TABLE ADD COLUMN (SQLite no requiere reconstruir).
// NO altera inventario: son columnas de registro/control de turno.
//   node --env-file=.env            scripts/migrate-conteo-turno.mjs
//   node --env-file=.env.production scripts/migrate-conteo-turno.mjs
import { getDb } from '../src/db.js';

const db = getDb();

async function cols(table) {
  return (await db.execute(`PRAGMA table_info(${table})`)).rows.map((r) => r.name);
}
async function addCol(table, name, ddl) {
  if ((await cols(table)).includes(name)) { console.log(`= ${table}.${name} ya existe`); return; }
  await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`✓ ${table}.${name} agregada`);
}

await addCol('cash_sessions', 'pollos_horno', 'pollos_horno INTEGER NOT NULL DEFAULT 0');
await addCol('cash_sessions', 'pollos_crudos_ini', 'pollos_crudos_ini INTEGER NOT NULL DEFAULT 0');
await addCol('cash_sessions', 'sacos_papas_ini', 'sacos_papas_ini INTEGER NOT NULL DEFAULT 0');
await addCol('cash_sessions', 'obs_apertura', 'obs_apertura TEXT');

await addCol('cash_register_closures', 'pollos_crudos_fin', 'pollos_crudos_fin INTEGER NOT NULL DEFAULT 0');
await addCol('cash_register_closures', 'merma_pollos', 'merma_pollos INTEGER NOT NULL DEFAULT 0');
await addCol('cash_register_closures', 'sacos_papas_fin', 'sacos_papas_fin INTEGER NOT NULL DEFAULT 0');
await addCol('cash_register_closures', 'obs_cierre', 'obs_cierre TEXT');

await addCol('business_settings', 'conteo_umbral', 'conteo_umbral INTEGER NOT NULL DEFAULT 3');

console.log('✓ migración conteo-turno OK');
