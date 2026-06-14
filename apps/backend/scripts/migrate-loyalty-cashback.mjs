// Migración idempotente: añade business_settings.loyalty_cashback_pct (% cashback).
// Uso: node scripts/migrate-loyalty-cashback.mjs
import { getDb } from '../src/db.js';

const db = getDb();
const cols = (await db.execute(`PRAGMA table_info(business_settings)`)).rows.map((r) => r.name);
if (!cols.includes('loyalty_cashback_pct')) {
  await db.execute(`ALTER TABLE business_settings ADD COLUMN loyalty_cashback_pct REAL NOT NULL DEFAULT 5`);
  console.log('✓ loyalty_cashback_pct agregada (default 5%).');
} else {
  console.log('· loyalty_cashback_pct ya existe. Nada que hacer.');
}
