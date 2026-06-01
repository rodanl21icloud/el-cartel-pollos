import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login, signSale } from './helpers.js';

let app, token, sess, productId, saleId;
const bearer = () => 'Bearer ' + token;
beforeAll(async () => {
  app = await getApp();
  const g = await login(app);
  token = g.token; sess = g.session;
  const prod = await request(app).post('/api/products').set('Authorization', bearer())
    .send({ name: 'Pedido Despacho ' + randomUUID().slice(0, 6), price: 5000 });
  productId = prod.body.id;
  const body = signSale({
    client_uuid: randomUUID(), payment_method: 'POS', sold_at: new Date().toISOString(),
    items: [{ product_id: productId, qty: 1 }],
  }, sess);
  const sale = await request(app).post('/api/sales/sync').set('Authorization', bearer()).send(body);
  saleId = sale.body.sale_id;
});

describe('Tablero de despacho', () => {
  it('lista los pedidos del día con su número de orden y estado', async () => {
    const res = await request(app).get('/api/dispatch').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body.day).toBeTruthy();
    const ours = res.body.orders.find((o) => o.sale_id === saleId);
    expect(ours).toBeDefined();
    expect(ours.status).toBe('PENDIENTE');
    expect(res.body.counts).toHaveProperty('PENDIENTE');
  });

  it('avanza el estado del pedido', async () => {
    for (const status of ['EN_PREPARACION', 'LISTO', 'ENTREGADO']) {
      const res = await request(app).put(`/api/dispatch/${saleId}/status`).set('Authorization', bearer())
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  });

  it('rechaza un estado inválido', async () => {
    const res = await request(app).put(`/api/dispatch/${saleId}/status`).set('Authorization', bearer())
      .send({ status: 'VOLANDO' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ESTADO_INVALIDO');
  });

  it('404 si el pedido no existe', async () => {
    const res = await request(app).put(`/api/dispatch/${randomUUID()}/status`).set('Authorization', bearer())
      .send({ status: 'LISTO' });
    expect(res.status).toBe(404);
  });
});
