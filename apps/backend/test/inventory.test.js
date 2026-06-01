import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, token;
const bearer = () => 'Bearer ' + token;
const rnd = () => randomUUID().slice(0, 6);
beforeAll(async () => { app = await getApp(); token = (await login(app)).token; });

const newIngredient = async (over = {}) => {
  const res = await request(app).post('/api/inventory/ingredients').set('Authorization', bearer())
    .send({ name: 'Insumo ' + rnd(), unit: 'unidad', stock_qty: 100, min_stock_qty: 10, cost_unit: 1000, ...over });
  expect(res.status).toBe(201);
  return res.body.id;
};
const stockOf = async (id) => {
  const list = (await request(app).get('/api/inventory/ingredients').set('Authorization', bearer())).body;
  return Number(list.find((i) => i.id === id).stock_qty);
};

describe('Inventario', () => {
  it('registra una merma que descuenta stock y exige justificación', async () => {
    const id = await newIngredient();
    const ok = await request(app).post('/api/inventory/merma').set('Authorization', bearer())
      .send({ ingredient_id: id, qty: 15, reason: 'Producto vencido', type: 'MERMA' });
    expect(ok.status).toBe(201);
    expect(ok.body.new_stock).toBe(85);

    const sinRazon = await request(app).post('/api/inventory/merma').set('Authorization', bearer())
      .send({ ingredient_id: id, qty: 1, type: 'MERMA' });
    expect(sinRazon.status).toBe(400);
    expect(sinRazon.body.error).toBe('JUSTIFICACION_OBLIGATORIA');
  });

  it('rechaza merma por sobre el stock disponible', async () => {
    const id = await newIngredient({ stock_qty: 5 });
    const res = await request(app).post('/api/inventory/merma').set('Authorization', bearer())
      .send({ ingredient_id: id, qty: 99, reason: 'x' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('STOCK_INSUFICIENTE');
  });

  it('repone stock y registra el gasto asociado', async () => {
    const id = await newIngredient({ stock_qty: 10 });
    const res = await request(app).post(`/api/inventory/ingredients/${id}/restock`).set('Authorization', bearer())
      .send({ qty: 40, unit_cost: 1200, expense: { payment_method: 'TRANSFERENCIA', supplier: 'Proveedor X' } });
    expect(res.status).toBe(201);
    expect(res.body.new_stock).toBe(50);
    expect(res.body.expense_id).toBeTruthy();
  });

  it('lista alertas de stock bajo', async () => {
    const id = await newIngredient({ stock_qty: 3, min_stock_qty: 10 });
    const res = await request(app).get('/api/inventory/alerts').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body.alerts.some((a) => a.id === id)).toBe(true);
  });

  it('actualiza un insumo (gerencia pasa OTP directo)', async () => {
    const id = await newIngredient();
    const res = await request(app).put(`/api/inventory/ingredients/${id}`).set('Authorization', bearer())
      .send({ cost_unit: 2500, min_stock_qty: 20 });
    expect(res.status).toBe(200);
    expect(res.body.cost_unit).toBe(2500);
  });

  it('bloquea eliminar un insumo en uso por una receta', async () => {
    const id = await newIngredient();
    const prod = await request(app).post('/api/products').set('Authorization', bearer())
      .send({ name: 'Prod ' + rnd(), price: 5000 });
    await request(app).put(`/api/products/${prod.body.id}/recipe`).set('Authorization', bearer())
      .send({ lines: [{ ingredient_id: id, qty_per_unit: 1 }] });

    const enUso = await request(app).delete(`/api/inventory/ingredients/${id}`).set('Authorization', bearer());
    expect(enUso.status).toBe(409);
    expect(enUso.body.error).toBe('INSUMO_EN_USO');

    // Quitarlo de la receta y eliminar.
    await request(app).put(`/api/products/${prod.body.id}/recipe`).set('Authorization', bearer()).send({ lines: [] });
    const ok = await request(app).delete(`/api/inventory/ingredients/${id}`).set('Authorization', bearer());
    expect(ok.status).toBe(200);
    expect(ok.body.deleted).toBe(true);
  });

  it('rechaza una unidad inválida al crear', async () => {
    const res = await request(app).post('/api/inventory/ingredients').set('Authorization', bearer())
      .send({ name: 'X ' + rnd(), unit: 'kilogramo' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('UNIDAD_INVALIDA');
  });
});
