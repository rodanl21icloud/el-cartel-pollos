import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login, signSale } from './helpers.js';

let app, token, sess, productId, groupId, optionId;
const bearer = () => 'Bearer ' + token;
beforeAll(async () => {
  app = await getApp();
  const g = await login(app);
  token = g.token; sess = g.session;
  const prod = await request(app).post('/api/products').set('Authorization', bearer())
    .send({ name: 'Pollo c/ Adición ' + randomUUID().slice(0, 6), price: 6000 });
  productId = prod.body.id;
});

describe('Modificadores / adiciones', () => {
  it('crea un grupo y una opción con recargo', async () => {
    const grp = await request(app).post('/api/modifiers/groups').set('Authorization', bearer())
      .send({ name: 'Agregados', min_select: 0, max_select: 2 });
    expect(grp.status).toBe(201);
    groupId = grp.body.id;

    const opt = await request(app).post('/api/modifiers/options').set('Authorization', bearer())
      .send({ group_id: groupId, name: 'Extra papas', price_delta: 1500 });
    expect(opt.status).toBe(201);
    optionId = opt.body.id;
  });

  it('asigna el grupo al producto y lo expone en el POS', async () => {
    const assign = await request(app).put(`/api/modifiers/groups/${groupId}/products`).set('Authorization', bearer())
      .send({ product_ids: [productId] });
    expect(assign.status).toBe(200);

    const mods = await request(app).get(`/api/products/${productId}/modifiers`).set('Authorization', bearer());
    expect(mods.status).toBe(200);
    expect(mods.body[0].options.find((o) => o.id === optionId).price_delta).toBe(1500);
  });

  it('aplica el recargo del modificador desde la DB al vender (anti-tamper de precio)', async () => {
    const body = signSale({
      client_uuid: randomUUID(), payment_method: 'EFECTIVO', sold_at: new Date().toISOString(),
      items: [{ product_id: productId, qty: 1, modifier_option_ids: [optionId] }],
    }, sess);
    const res = await request(app).post('/api/sales/sync').set('Authorization', bearer()).send(body);
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(7500); // 6000 + 1500
  });

  it('rechaza una opción sin grupo válido', async () => {
    const res = await request(app).post('/api/modifiers/options').set('Authorization', bearer())
      .send({ group_id: randomUUID(), name: 'x', price_delta: 0 });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('GRUPO_NO_ENCONTRADO');
  });

  it('elimina la opción y el grupo', async () => {
    const o = await request(app).delete(`/api/modifiers/options/${optionId}`).set('Authorization', bearer());
    expect(o.status).toBe(200);
    const g = await request(app).delete(`/api/modifiers/groups/${groupId}`).set('Authorization', bearer());
    expect(g.status).toBe(200);
  });
});
