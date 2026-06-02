import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, token, productId;
const SLUG = 'cartel-test';
const bearer = () => 'Bearer ' + token;
const prodName = 'Catálogo Item ' + randomUUID().slice(0, 6);

beforeAll(async () => {
  app = await getApp();
  token = (await login(app)).token;
  // Configurar slug + entregas.
  await request(app).put('/api/settings').set('Authorization', bearer())
    .send({ catalog_slug: SLUG, pickup_enabled: 1, delivery_enabled: 1, whatsapp: '+56912345678' });
  const p = await request(app).post('/api/products').set('Authorization', bearer())
    .send({ name: prodName, price: 6500, category: 'POLLO' });
  productId = p.body.id;
});

describe('Catálogo público + formas de entrega', () => {
  it('expone el catálogo sin autenticación', async () => {
    const res = await request(app).get(`/api/public/catalog/${SLUG}`); // sin token
    expect(res.status).toBe(200);
    expect(res.body.business.name).toBeTruthy();
    expect(res.body.delivery).toEqual({ pickup: true, delivery: true });
    const all = res.body.categories.flatMap((c) => c.items.map((i) => i.name));
    expect(all).toContain(prodName);
  });

  it('no expone datos sensibles (costo, receta, stock)', async () => {
    const res = await request(app).get(`/api/public/catalog/${SLUG}`);
    const item = res.body.categories.flatMap((c) => c.items).find((i) => i.name === prodName);
    expect(item).toBeDefined();
    expect(item).not.toHaveProperty('costo');
    expect(item).not.toHaveProperty('id');
    expect(item.price).toBe(6500);
  });

  it('oculta un producto marcado in_catalog=false', async () => {
    await request(app).put(`/api/products/${productId}`).set('Authorization', bearer()).send({ in_catalog: false });
    const res = await request(app).get(`/api/public/catalog/${SLUG}`);
    const all = res.body.categories.flatMap((c) => c.items.map((i) => i.name));
    expect(all).not.toContain(prodName);
  });

  it('404 con un slug que no coincide', async () => {
    const res = await request(app).get('/api/public/catalog/otro-negocio');
    expect(res.status).toBe(404);
  });

  it('refleja el apagado de una forma de entrega', async () => {
    await request(app).put('/api/settings').set('Authorization', bearer()).send({ delivery_enabled: 0 });
    const res = await request(app).get(`/api/public/catalog/${SLUG}`);
    expect(res.body.delivery.delivery).toBe(false);
    expect(res.body.delivery.pickup).toBe(true);
  });

  it('normaliza el slug (minúsculas, sin símbolos)', async () => {
    const res = await request(app).put('/api/settings').set('Authorization', bearer())
      .send({ catalog_slug: '  El Cartel!! Pollos  ' });
    expect(res.status).toBe(200);
    expect(res.body.catalog_slug).toBe('el-cartel-pollos');
    // restaurar para no afectar otros asserts del archivo
    await request(app).put('/api/settings').set('Authorization', bearer()).send({ catalog_slug: SLUG });
  });
});
