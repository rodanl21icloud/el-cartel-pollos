import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login, signSale } from './helpers.js';

let app, token, sess, ingredientId, productId;
const bearer = () => 'Bearer ' + token;

beforeAll(async () => {
  app = await getApp();
  const g = await login(app, 'gerente', 'gerente123');
  token = g.token; sess = g.session;

  const ing = await request(app).post('/api/inventory/ingredients').set('Authorization', bearer())
    .send({ name: 'Pollo Test ' + randomUUID().slice(0, 6), unit: 'unidad', stock_qty: 100, cost_unit: 2000 });
  expect(ing.status).toBe(201);
  ingredientId = ing.body.id;

  const prod = await request(app).post('/api/products').set('Authorization', bearer())
    .send({ name: 'Pollo Asado Test ' + randomUUID().slice(0, 6), price: 8000 });
  expect(prod.status).toBe(201);
  productId = prod.body.id;
});

const stockOf = async (id) => {
  const res = await request(app).get('/api/inventory/ingredients').set('Authorization', bearer());
  return Number(res.body.find((i) => i.id === id).stock_qty);
};

describe('Recetas (BOM): crear, leer, descontar inventario y eliminar', () => {
  it('crea una receta y calcula el costo de insumos', async () => {
    const res = await request(app).put(`/api/products/${productId}/recipe`).set('Authorization', bearer())
      .send({ lines: [{ ingredient_id: ingredientId, qty_per_unit: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.lines).toBe(1);

    const get = await request(app).get(`/api/products/${productId}/recipe`).set('Authorization', bearer());
    expect(get.body.lines).toHaveLength(1);
    expect(get.body.costo_insumos).toBe(2000);
  });

  it('descuenta el inventario al vender (BOM)', async () => {
    const before = await stockOf(ingredientId);
    const body = signSale({
      client_uuid: randomUUID(), payment_method: 'EFECTIVO', sold_at: new Date().toISOString(),
      items: [{ product_id: productId, qty: 3 }],
    }, sess);
    const res = await request(app).post('/api/sales/sync').set('Authorization', bearer()).send(body);
    expect(res.status).toBe(201);
    const after = await stockOf(ingredientId);
    expect(after).toBe(before - 3);
  });

  it('elimina la receta (replace-all con lista vacía)', async () => {
    const res = await request(app).put(`/api/products/${productId}/recipe`).set('Authorization', bearer())
      .send({ lines: [] });
    expect(res.status).toBe(200);
    expect(res.body.lines).toBe(0);
    const get = await request(app).get(`/api/products/${productId}/recipe`).set('Authorization', bearer());
    expect(get.body.lines).toHaveLength(0);
  });

  it('rechaza líneas con cantidad inválida', async () => {
    const res = await request(app).put(`/api/products/${productId}/recipe`).set('Authorization', bearer())
      .send({ lines: [{ ingredient_id: ingredientId, qty_per_unit: 0 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CANTIDAD_INVALIDA');
  });
});
