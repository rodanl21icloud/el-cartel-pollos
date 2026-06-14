// Fase 2 (D2C) — Tracking público + Upselling BOM.
//  2.1 GET /api/public/tracking/:order_number — estado del pedido de hoy, sin PII.
//  2.2 /api/public/catalog/:slug expone `upsell` (2 complementos top-margen),
//      sin filtrar costo ni margen.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login, signSale } from './helpers.js';

let app, cajero, gtoken, prodId;
const bearer = (t) => 'Bearer ' + t;
const saleIds = [];

beforeAll(async () => {
  app = await getApp();
  cajero = await login(app, 'cajero1', 'cajero123');
  gtoken = (await login(app, 'gerente', 'gerente123')).token;
  const p = await request(app).post('/api/products').set('Authorization', bearer(gtoken))
    .send({ name: 'Track Prod ' + randomUUID().slice(0, 6), price: 8000 });
  prodId = p.body.id;
});

afterAll(async () => {
  for (const id of saleIds) {
    try { await request(app).post(`/api/sales/${id}/void`).set('Authorization', bearer(gtoken)).send({ reason: 'cleanup test' }); } catch { /* */ }
  }
});

describe('Tracking público', () => {
  it('expone el estado del pedido del día y refleja la transición de despacho', async () => {
    const body = signSale({
      client_uuid: randomUUID(), payment_method: 'EFECTIVO', sold_at: new Date().toISOString(),
      items: [{ product_id: prodId, qty: 1 }],
    }, cajero.session);
    const sale = await request(app).post('/api/sales/sync').set('Authorization', bearer(cajero.token)).send(body);
    expect(sale.status).toBe(201);
    const orderNum = sale.body.order_number;
    saleIds.push(sale.body.sale_id);

    let t = await request(app).get(`/api/public/tracking/${orderNum}`); // sin auth
    expect(t.status).toBe(200);
    expect(t.body.found).toBe(true);
    expect(t.body.order_number).toBe(orderNum);
    expect(t.body.status).toBe('PENDIENTE');
    expect(t.body.step).toBe(1);
    expect(t.body.total_steps).toBe(4);

    // Cocina marca LISTO -> el tracking lo refleja.
    const up = await request(app).put(`/api/dispatch/${sale.body.sale_id}/status`)
      .set('Authorization', bearer(gtoken)).send({ status: 'LISTO' });
    expect(up.status).toBe(200);

    t = await request(app).get(`/api/public/tracking/${orderNum}`);
    expect(t.body.status).toBe('LISTO');
    expect(t.body.step).toBe(3);
  });

  it('devuelve found=false para una orden inexistente', async () => {
    const t = await request(app).get('/api/public/tracking/999999');
    expect(t.status).toBe(200);
    expect(t.body.found).toBe(false);
  });

  it('rechaza un número de orden inválido (400)', async () => {
    const t = await request(app).get('/api/public/tracking/abc');
    expect(t.status).toBe(400);
    expect(t.body.error).toBe('ORDEN_INVALIDA');
  });
});

describe('Upselling BOM en el catálogo público', () => {
  it('sugiere ≤2 complementos por margen, sin exponer costo ni margen', async () => {
    // Complemento de margen dominante (precio alto, costo ínfimo).
    await request(app).post('/api/products').set('Authorization', bearer(gtoken))
      .send({ name: 'Papas Premium ' + randomUUID().slice(0, 6), price: 99999, category: 'PAPAS', cost: 1 });

    const c = await request(app).get('/api/public/catalog/cualquier-slug');
    expect(c.status).toBe(200);
    expect(Array.isArray(c.body.upsell)).toBe(true);
    expect(c.body.upsell.length).toBeLessThanOrEqual(2);
    expect(c.body.upsell.length).toBeGreaterThan(0);

    for (const item of c.body.upsell) {
      // Solo complementos.
      expect(['PAPAS', 'BEBIDAS', 'SNACKS']).toContain(item.category);
      // Privacidad: solo name/price/category — nunca costo ni margen.
      expect(Object.keys(item).sort()).toEqual(['category', 'name', 'price']);
    }
  });
});
