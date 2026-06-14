// Fase 3 (D2C) — Agente Comercial Proactivo (win-back).
//  - selectDormant filtra por ventana (15–60 días) y excluye clientes sin teléfono.
//  - draftWinbacks en modo DEGRADADO (sin ANTHROPIC_API_KEY) devuelve plantilla
//    + wa.me válido y NO filtra el teléfono al modelo (no se llama a la API real).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/db.js';
import { selectDormant, draftWinbacks } from '../src/services/marketing/winback.js';

const db = getDb();
const seededSales = [];

// Siembra una venta de PRODUCTOS confirmada con fecha controlada (N días atrás).
async function seedSale({ clientId, userId, productId, daysAgo }) {
  const saleId = randomUUID();
  const soldAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
  await db.execute({
    sql: `INSERT INTO sales (id, client_uuid, user_id, total, payment_method, status, payload_hash, kind, client_id, sold_at)
          VALUES (?,?,?,?, 'EFECTIVO', 'CONFIRMADA', ?, 'PRODUCTOS', ?, ?)`,
    args: [saleId, randomUUID(), userId, 10000, 'hash', clientId, soldAt],
  });
  await db.execute({
    sql: `INSERT INTO sale_items (id, sale_id, product_id, qty, unit_price, line_total) VALUES (?,?,?,?,?,?)`,
    args: [randomUUID(), saleId, productId, 1, 10000, 10000],
  });
  seededSales.push(saleId);
  return saleId;
}

let userId, productId, dormantId, recentId, noPhoneId;

beforeAll(async () => {
  // El test corre en modo degradado: sin API key no se llama a Anthropic.
  delete process.env.ANTHROPIC_API_KEY;

  userId = (await db.execute({ sql: `SELECT id FROM users WHERE username='cajero1'`, args: [] })).rows[0].id;
  productId = randomUUID();
  await db.execute({
    sql: `INSERT INTO products (id, sku, name, price, category) VALUES (?,?,?,?,?)`,
    args: [productId, 'WB-' + productId.slice(0, 6), 'Pollo Entero WB', 12000, 'POLLO'],
  });

  const mk = async (name, phone) => {
    const id = randomUUID();
    await db.execute({ sql: `INSERT INTO clients (id, phone, name) VALUES (?,?,?)`, args: [id, phone, name] });
    return id;
  };
  dormantId = await mk('Walter White', '+56911110001');   // 30 días -> dormido
  recentId = await mk('Jesse Pinkman', '+56911110002');    // 3 días -> NO dormido
  noPhoneId = await mk('Saul Goodman', null);              // sin teléfono -> excluido

  await seedSale({ clientId: dormantId, userId, productId, daysAgo: 30 });
  await seedSale({ clientId: recentId, userId, productId, daysAgo: 3 });
  await seedSale({ clientId: noPhoneId, userId, productId, daysAgo: 25 });
});

// Limpia ventas/clientes/producto sembrados para no contaminar reportes por ventana.
afterAll(async () => {
  for (const id of seededSales) {
    try { await db.execute({ sql: `DELETE FROM sales WHERE id=?`, args: [id] }); } catch { /* */ }
  }
  for (const id of [dormantId, recentId, noPhoneId]) {
    try { await db.execute({ sql: `DELETE FROM clients WHERE id=?`, args: [id] }); } catch { /* */ }
  }
  try { await db.execute({ sql: `DELETE FROM products WHERE id=?`, args: [productId] }); } catch { /* */ }
});

describe('Win-back — selección de clientes dormidos', () => {
  it('incluye dormidos en la ventana y excluye recientes y sin teléfono', async () => {
    const rows = await selectDormant(db, { minDays: 15, maxDays: 60, limit: 100 });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(dormantId);
    expect(ids).not.toContain(recentId);   // 3 días: fuera de ventana
    expect(ids).not.toContain(noPhoneId);  // sin teléfono: excluido
    const w = rows.find((r) => r.id === dormantId);
    expect(w.days_since).toBeGreaterThanOrEqual(15);
    expect(w.favorite).toBe('Pollo Entero WB');
  });
});

describe('Win-back — borradores en modo degradado', () => {
  it('genera plantilla + wa.me válido sin llamar a la API', async () => {
    const out = await draftWinbacks({ minDays: 15, maxDays: 60, limit: 100 });
    expect(out.model).toBe('plantilla');         // sin API key
    const d = out.drafts.find((x) => x.client_id === dormantId);
    expect(d).toBeTruthy();
    expect(d.ai).toBe(false);
    expect(d.name).toBe('Walter');               // solo primer nombre
    expect(d.message).toContain('Walter');
    expect(d.message).toContain('Pollo Entero WB');
    // wa.me con solo dígitos del teléfono; el mensaje NO contiene el teléfono.
    expect(d.whatsapp_url).toMatch(/^https:\/\/wa\.me\/56911110001\?text=/);
    expect(d.message).not.toContain('56911110001');
  });
});
