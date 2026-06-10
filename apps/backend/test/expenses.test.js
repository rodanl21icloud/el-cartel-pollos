import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, token;
const bearer = () => 'Bearer ' + token;
beforeAll(async () => { app = await getApp(); token = (await login(app)).token; });

describe('Gastos', () => {
  it('lista las categorías sembradas', async () => {
    const res = await request(app).get('/api/expenses/categories').set('Authorization', bearer());
    expect(res.status).toBe(200);
    const ids = res.body.map((c) => c.id);
    expect(ids).toContain('cat-proveedores');
    expect(res.body.find((c) => c.id === 'cat-retiros').kind).toBe('RETIRO');
  });

  it('registra un gasto operativo válido', async () => {
    const res = await request(app).post('/api/expenses').set('Authorization', bearer())
      .send({ category_id: 'cat-arriendo', amount: 250000, payment_method: 'TRANSFERENCIA', description: 'Arriendo local' });
    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(250000);
  });

  it('rechaza método de pago inválido', async () => {
    const res = await request(app).post('/api/expenses').set('Authorization', bearer())
      .send({ category_id: 'cat-arriendo', amount: 1000, payment_method: 'BITCOIN', description: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('METODO_PAGO_INVALIDO');
  });

  it('edita y luego elimina un gasto', async () => {
    const cre = await request(app).post('/api/expenses').set('Authorization', bearer())
      .send({ category_id: 'cat-arriendo', amount: 5000, payment_method: 'EFECTIVO', description: 'Gasto a borrar' });
    const id = cre.body.expense_id;
    const upd = await request(app).put(`/api/expenses/${id}`).set('Authorization', bearer())
      .send({ category_id: 'cat-arriendo', amount: 6000, payment_method: 'EFECTIVO', description: 'Editado' });
    expect(upd.status).toBe(200);
    const del = await request(app).delete(`/api/expenses/${id}`).set('Authorization', bearer());
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(id);
    const del2 = await request(app).delete(`/api/expenses/${id}`).set('Authorization', bearer());
    expect(del2.status).toBe(404);
  });

  it('rechaza categoría inexistente', async () => {
    const res = await request(app).post('/api/expenses').set('Authorization', bearer())
      .send({ category_id: 'cat-fantasma', amount: 1000, payment_method: 'EFECTIVO', description: 'x' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('CATEGORIA_NO_ENCONTRADA');
  });

  it('exige descripción', async () => {
    const res = await request(app).post('/api/expenses').set('Authorization', bearer())
      .send({ category_id: 'cat-arriendo', amount: 1000, payment_method: 'EFECTIVO', description: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DESCRIPCION_OBLIGATORIA');
  });

  it('lista los gastos (gerencia)', async () => {
    const res = await request(app).get('/api/expenses').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body.some((e) => e.category === 'Arriendo y servicios')).toBe(true);
  });
});

describe('Categorías de carta', () => {
  it('renombra/fusiona una categoría (mueve productos)', async () => {
    const request = (await import('supertest')).default;
    await request(app).post('/api/products').set('Authorization', bearer())
      .send({ name: 'Prod cat test', price: 1000, category: 'CATVIEJA' });
    const res = await request(app).put('/api/products/categories/rename').set('Authorization', bearer())
      .send({ from: 'CATVIEJA', to: 'CATNUEVA' });
    expect(res.status).toBe(200);
    expect(res.body.moved).toBeGreaterThan(0);
  });
});
