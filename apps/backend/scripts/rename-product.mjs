// ============================================================
// Renombra un producto aplicando la validación de KAN-28 y dejando traza en
// auditoría (PRODUCT_UPDATE). Identifica por nombre actual exacto.
//   node --env-file=.env            scripts/rename-product.mjs ".UPBEB125" "Bebida UP 125ml"
//   node --env-file=.env.production scripts/rename-product.mjs ".UPBEB125" "Bebida UP 125ml"
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/db.js';

const actual = process.argv[2];
const nuevo = (process.argv[3] || '').trim();

// Espejo de validarNombreProducto (apps/frontend/src/lib/productName.js).
function nombreInvalido(raw) {
  const n = String(raw ?? '').trim();
  if (n.length < 3) return true;
  if (!/^[a-záéíóúñü]/i.test(n)) return true;
  if (/[A-Z]{2,}-?\d+/.test(n)) return true;
  return false;
}

if (!actual || !nuevo) { console.error('✗ Uso: rename-product.mjs "<nombre actual>" "<nombre nuevo>"'); process.exit(1); }
if (nombreInvalido(nuevo)) { console.error(`✗ El nuevo nombre "${nuevo}" no es válido (descriptivo, sin código).`); process.exit(1); }

const db = getDb();
const p = (await db.execute({ sql: `SELECT id, name FROM products WHERE name = ?`, args: [actual] })).rows[0];
if (!p) { console.error(`✗ No se encontró un producto con nombre exacto "${actual}".`); process.exit(1); }

await db.batch([
  { sql: `UPDATE products SET name = ?, updated_at = datetime('now') WHERE id = ?`, args: [nuevo, p.id] },
  {
    sql: `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, severity, metadata)
          VALUES (?, NULL, 'PRODUCT_UPDATE', 'products', ?, 'INFO', ?)`,
    args: [randomUUID(), p.id, JSON.stringify({ before: { name: p.name }, after: { name: nuevo }, via: 'script (KAN-28)' })],
  },
], 'write');

console.log(`✓ Renombrado: "${p.name}" → "${nuevo}"`);
