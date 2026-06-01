import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, token, productId;
const bearer = () => 'Bearer ' + token;
beforeAll(async () => {
  app = await getApp();
  token = (await login(app)).token;
  const prod = await request(app).post('/api/products').set('Authorization', bearer())
    .send({ name: 'Carta Item ' + randomUUID().slice(0, 6), price: 7000, category: 'COMBO' });
  productId = prod.body.id;
});

describe('Carta (catálogo)', () => {
  it('lista el catálogo con costo, ganancia y margen', async () => {
    const res = await request(app).get('/api/products/catalog').set('Authorization', bearer());
    expect(res.status).toBe(200);
    const item = res.body.find((p) => p.id === productId);
    expect(item).toBeDefined();
    expect(item).toHaveProperty('costo');
    expect(item).toHaveProperty('ganancia');
    expect(item).toHaveProperty('margen');
    expect(item.has_recipe).toBe(false);
  });

  it('actualiza el precio del producto (gerencia pasa OTP directo)', async () => {
    const res = await request(app).put(`/api/products/${productId}`).set('Authorization', bearer())
      .send({ price: 8500 });
    expect(res.status).toBe(200);
    expect(res.body.price).toBe(8500);
    const cat = await request(app).get('/api/products/catalog').set('Authorization', bearer());
    expect(cat.body.find((p) => p.id === productId).price).toBe(8500);
  });

  it('rechaza un precio inválido', async () => {
    const res = await request(app).put(`/api/products/${productId}`).set('Authorization', bearer())
      .send({ price: -5 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PRECIO_INVALIDO');
  });

  it('elimina (baja lógica) y desaparece del catálogo y del POS', async () => {
    const del = await request(app).delete(`/api/products/${productId}`).set('Authorization', bearer());
    expect(del.status).toBe(200);
    const cat = await request(app).get('/api/products/catalog').set('Authorization', bearer());
    expect(cat.body.find((p) => p.id === productId)).toBeUndefined();
    const pos = await request(app).get('/api/products').set('Authorization', bearer());
    expect(pos.body.find((p) => p.id === productId)).toBeUndefined();
  });
});
