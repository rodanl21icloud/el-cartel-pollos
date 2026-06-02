import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login, signSale } from './helpers.js';

let app, token, sess;
const bearer = () => 'Bearer ' + token;
const FROM = '2020-01-01T00:00:00.000Z';
const TO = '2999-12-31T23:59:59.999Z';

beforeAll(async () => {
  app = await getApp();
  const g = await login(app);
  token = g.token; sess = g.session;
  // Una venta y un gasto para tener movimientos.
  const prod = await request(app).post('/api/products').set('Authorization', bearer())
    .send({ name: 'Mov Item ' + randomUUID().slice(0, 6), price: 5000 });
  const body = signSale({ client_uuid: randomUUID(), payment_method: 'EFECTIVO', sold_at: new Date().toISOString(), items: [{ product_id: prod.body.id, qty: 2 }] }, sess);
  await request(app).post('/api/sales/sync').set('Authorization', bearer()).send(body);
  await request(app).post('/api/expenses').set('Authorization', bearer())
    .send({ category_id: 'cat-arriendo', amount: 30000, payment_method: 'TRANSFERENCIA', description: 'Test egreso' });
});

describe('Movimientos y exportación de reportes', () => {
  it('devuelve el libro de movimientos con KPIs (ingresos y egresos)', async () => {
    const res = await request(app).get('/api/reports/movements').query({ from: FROM, to: TO }).set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body.kpis.ventas.total).toBeGreaterThan(0);
    expect(res.body.kpis.gastos.total).toBeGreaterThanOrEqual(30000);
    expect(res.body.kpis.balance).toBe(res.body.kpis.ventas.total - res.body.kpis.gastos.total);
    expect(res.body.items.some((m) => m.tipo === 'INGRESO')).toBe(true);
    expect(res.body.items.some((m) => m.tipo === 'EGRESO')).toBe(true);
  });

  it('filtra por tipo (solo egresos)', async () => {
    const res = await request(app).get('/api/reports/movements').query({ from: FROM, to: TO, type: 'EGRESO' }).set('Authorization', bearer());
    expect(res.body.items.every((m) => m.tipo === 'EGRESO')).toBe(true);
  });

  it('stats incluye comparativo vs período anterior', async () => {
    const res = await request(app).get('/api/reports/stats').query({ from: FROM, to: TO }).set('Authorization', bearer());
    expect(res.body).toHaveProperty('comparativo');
    expect(res.body.comparativo).toHaveProperty('delta_total');
  });

  it('exporta CSV de movimientos con cabecera y separador ;', async () => {
    const res = await request(app).get('/api/reports/export').query({ type: 'movimientos', from: FROM, to: TO }).set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain('Fecha;Concepto;Tipo;Método;Valor');
  });

  it('exporta CSV de productos', async () => {
    const res = await request(app).get('/api/reports/export').query({ type: 'productos', from: FROM, to: TO }).set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Producto;Unidades;Monto');
  });

  it('el cajero no puede exportar (reports.view)', async () => {
    const caj = (await login(app, 'cajero1', 'cajero123')).token;
    const res = await request(app).get('/api/reports/export').query({ type: 'ventas' }).set('Authorization', 'Bearer ' + caj);
    expect(res.status).toBe(403);
  });
});
