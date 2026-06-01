import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login, signSale } from './helpers.js';

let app, sess, token, productId;
const bearer = () => 'Bearer ' + token;

beforeAll(async () => {
  app = await getApp();
  const g = await login(app, 'gerente', 'gerente123');
  token = g.token; sess = g.session;
  const prod = await request(app).post('/api/products').set('Authorization', bearer())
    .send({ name: 'Combo Test ' + randomUUID().slice(0, 6), price: 9990 });
  expect(prod.status).toBe(201);
  productId = prod.body.id;
});

function salePayload(qty = 2) {
  return {
    client_uuid: randomUUID(),
    payment_method: 'EFECTIVO',
    sold_at: new Date().toISOString(),
    items: [{ product_id: productId, qty }],
  };
}

describe('Ventas firmadas (HMAC, idempotencia, anti-tamper, anulación)', () => {
  let firstSaleId;

  it('registra una venta firmada y calcula el total', async () => {
    const body = signSale(salePayload(2), sess);
    const res = await request(app).post('/api/sales/sync').set('Authorization', bearer()).send(body);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CREATED');
    expect(res.body.total).toBe(19980);
    expect(Number.isInteger(res.body.order_number)).toBe(true);
    firstSaleId = res.body.sale_id;
  });

  it('es idempotente por client_uuid (reintento offline)', async () => {
    const body = signSale(salePayload(1), sess);
    const a = await request(app).post('/api/sales/sync').set('Authorization', bearer()).send(body);
    expect(a.status).toBe(201);
    const b = await request(app).post('/api/sales/sync').set('Authorization', bearer()).send(body);
    expect(b.status).toBe(200);
    expect(b.body.status).toBe('DUPLICATE');
    expect(b.body.sale_id).toBe(a.body.sale_id);
  });

  it('rechaza un payload manipulado tras la firma', async () => {
    const body = signSale(salePayload(1), sess);
    body.payload.items[0].qty = 99; // manipulación tras firmar
    const res = await request(app).post('/api/sales/sync').set('Authorization', bearer()).send(body);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PAYLOAD_MANIPULADO');
  });

  it('rechaza una sesión HMAC inválida', async () => {
    const body = signSale(salePayload(1), sess);
    body.sessionId = randomUUID();
    const res = await request(app).post('/api/sales/sync').set('Authorization', bearer()).send(body);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SESION_NO_VALIDA');
  });

  it('anula una venta y la excluye del listado', async () => {
    const res = await request(app).post(`/api/sales/${firstSaleId}/void`).set('Authorization', bearer()).send({ reason: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ANULADA');
    const list = await request(app).get('/api/sales').set('Authorization', bearer());
    expect(list.body.find((s) => s.id === firstSaleId)).toBeUndefined();
  });
});
