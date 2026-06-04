// Idempotente: business_settings.cartelera_theme (plantilla de la cartelera).
import { getDb } from '../src/db.js';
const db = getDb();
const cols = (await db.execute(`PRAGMA table_info(business_settings)`)).rows.map((r) => r.name);
if (cols.includes('cartelera_theme')) console.log('= business_settings.cartelera_theme ya existe');
else { await db.execute(`ALTER TABLE business_settings ADD COLUMN cartelera_theme TEXT`); console.log('✓ business_settings.cartelera_theme agregada'); }
