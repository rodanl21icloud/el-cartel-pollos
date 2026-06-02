import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, token;
const bearer = () => 'Bearer ' + token;
beforeAll(async () => { app = await getApp(); token = (await login(app)).token; });

const crear = (name, extra = {}) => request(app).post('/api/products').set('Authorization', bearer())
  .send({ name, price: 1000, category: 'BEBIDAS', ...extra });

describe('KAN-28 · Validación de nombre de producto', () => {
  it('acepta un nombre descriptivo válido', async () => {
    const res = await crear('Bebida UP 125ml ' + randomUUID().slice(0, 4));
    expect(res.status).toBe(201);
  });

  it('rechaza nombres de código y mal formados', async () => {
    for (const n of ['.UPBEB125', 'UPBEB125', 'IMP-001', 'ab', '  ', '-pollo', '125 bebida']) {
      const res = await crear(n);
      expect(res.status, `nombre: "${n}"`).toBe(400);
      expect(res.body.error).toBe('NOMBRE_INVALIDO');
    }
  });

  it('permite renombrar a un nombre válido y bloquea uno inválido', async () => {
    const prod = (await crear('Producto Temporal ' + randomUUID().slice(0, 4))).body;
    const ok = await request(app).put(`/api/products/${prod.id}`).set('Authorization', bearer()).send({ name: 'Bebida Naranja 250ml' });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Bebida Naranja 250ml');
    const bad = await request(app).put(`/api/products/${prod.id}`).set('Authorization', bearer()).send({ name: '.OTROCODIGO9' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('NOMBRE_INVALIDO');
  });

  it('NO bloquea editar otros campos (foto/visibilidad/precio) sin tocar el nombre', async () => {
    const prod = (await crear('Producto Otro ' + randomUUID().slice(0, 4))).body;
    const res = await request(app).put(`/api/products/${prod.id}`).set('Authorization', bearer()).send({ in_catalog: false, price: 1500 });
    expect(res.status).toBe(200);
  });
});
