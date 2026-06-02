import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login, signSale } from './helpers.js';

let app, token, sess, ingId, productId;
const bearer = () => 'Bearer ' + token;

beforeAll(async () => {
  app = await getApp();
  const g = await login(app);
  token = g.token; sess = g.session;
  // Insumo "pollo" + producto con receta de 1 pollo/unidad.
  const ing = await request(app).post('/api/inventory/ingredients').set('Authorization', bearer())
    .send({ name: 'pollo-fc-' + randomUUID().slice(0, 5), unit: 'unidad', stock_qty: 100000, cost_unit: 3000 });
  ingId = ing.body.id;
  const prod = await request(app).post('/api/products').set('Authorization', bearer())
    .send({ name: 'Pollo FC ' + randomUUID().slice(0, 5), price: 12000 });
  productId = prod.body.id;
  await request(app).put(`/api/products/${productId}/recipe`).set('Authorization', bearer())
    .send({ lines: [{ ingredient_id: ingId, qty_per_unit: 1 }] });
  // Ventas recientes (hoy) para alimentar el predictor.
  for (let i = 0; i < 3; i++) {
    const body = signSale({ client_uuid: randomUUID(), payment_method: 'EFECTIVO', sold_at: new Date().toISOString(), items: [{ product_id: productId, qty: 2 }] }, sess);
    await request(app).post('/api/sales/sync').set('Authorization', bearer()).send(body);
  }
});

describe('Predictor de horno', () => {
  it('devuelve patrón por día de semana y próximos 7 días', async () => {
    const res = await request(app).get('/api/reports/forecast?weeks=8').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body.per_weekday).toHaveLength(7);
    expect(res.body.next_7_days).toHaveLength(7);
    expect(res.body.next_7_days[0].etiqueta).toBe('Hoy');
  });

  it('cuenta pollos-equivalente con la receta (>=6 hoy) e incluye el producto en el mix', async () => {
    const res = await request(app).get('/api/reports/forecast?weeks=8').set('Authorization', bearer());
    const hoyDow = new Date().getDay();
    const w = res.body.per_weekday.find((x) => x.dow === hoyDow);
    expect(w.max).toBeGreaterThanOrEqual(6); // 3 ventas x 2 unidades x 1 pollo
    expect(res.body.por_producto.some((p) => p.pollo === 1)).toBe(true);
  });

  it('exporta P&L y flujo en CSV', async () => {
    const pnl = await request(app).get('/api/reports/export?type=pnl').set('Authorization', bearer());
    expect(pnl.status).toBe(200);
    expect(pnl.text).toContain('Concepto;Valor');
    expect(pnl.text).toContain('Utilidad operativa');
    const flujo = await request(app).get('/api/reports/export?type=flujo').set('Authorization', bearer());
    expect(flujo.text).toContain('Día;Ingresos;Egresos;Neto');
  });

  it('el cajero no puede ver la predicción', async () => {
    const caj = (await login(app, 'cajero1', 'cajero123')).token;
    const res = await request(app).get('/api/reports/forecast').set('Authorization', 'Bearer ' + caj);
    expect(res.status).toBe(403);
  });
});
