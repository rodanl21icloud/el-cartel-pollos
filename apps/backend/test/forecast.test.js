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

  it('incluye demanda por hora y plan de horneado de hoy', async () => {
    const res = await request(app).get('/api/reports/forecast?weeks=8&roast=75').set('Authorization', bearer());
    expect(res.body.por_hora).toHaveLength(24);
    expect(res.body.plan_hoy).toBeDefined();
    expect(res.body.plan_hoy.roast_min).toBe(75);
    expect(Array.isArray(res.body.plan_hoy.horneadas)).toBe(true);
    // Hubo ventas hoy ⇒ al menos una tanda con hora "poner → listo".
    if (res.body.plan_hoy.total > 0) {
      expect(res.body.plan_hoy.horneadas[0]).toHaveProperty('poner');
      expect(res.body.plan_hoy.horneadas[0]).toHaveProperty('pollos');
    }
  });

  it('respeta la meta de servicio (mayor meta ⇒ recomendado no menor)', async () => {
    const baja = await request(app).get('/api/reports/forecast?weeks=8&service=0.5').set('Authorization', bearer());
    const alta = await request(app).get('/api/reports/forecast?weeks=8&service=0.9').set('Authorization', bearer());
    expect(baja.body.service).toBe(0.5);
    const dow = new Date().getDay();
    const rb = baja.body.per_weekday.find((x) => x.dow === dow).recomendado;
    const ra = alta.body.per_weekday.find((x) => x.dow === dow).recomendado;
    expect(ra).toBeGreaterThanOrEqual(rb);
  });

  it('exporta P&L y flujo en CSV', async () => {
    const pnl = await request(app).get('/api/reports/export?type=pnl').set('Authorization', bearer());
    expect(pnl.status).toBe(200);
    expect(pnl.text).toContain('Concepto;Valor');
    expect(pnl.text).toContain('Utilidad operativa');
    const flujo = await request(app).get('/api/reports/export?type=flujo').set('Authorization', bearer());
    expect(flujo.text).toContain('Día;Ingresos;Egresos;Neto');
  });

  it('la cocina (preparador) y el cajero SÍ pueden ver la predicción (forecast.view)', async () => {
    const prep = (await login(app, 'prep1', 'prep123')).token;
    const caj = (await login(app, 'cajero1', 'cajero123')).token;
    const rp = await request(app).get('/api/reports/forecast').set('Authorization', 'Bearer ' + prep);
    const rc = await request(app).get('/api/reports/forecast').set('Authorization', 'Bearer ' + caj);
    expect(rp.status).toBe(200);
    expect(rc.status).toBe(200);
  });

  it('pero NO pueden ver reportes financieros (reports.view)', async () => {
    const prep = (await login(app, 'prep1', 'prep123')).token;
    const res = await request(app).get('/api/reports/pnl').set('Authorization', 'Bearer ' + prep);
    expect(res.status).toBe(403);
  });
});
