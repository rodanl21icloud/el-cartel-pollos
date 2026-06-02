import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, token;
const bearer = () => 'Bearer ' + token;
beforeAll(async () => { app = await getApp(); token = (await login(app)).token; });

const crear = (name, extra = {}) => request(app).post('/api/products').set('Authorization', bearer())
  .send({ name, price: 1000, category: 'BEBIDAS', ...extra });
const sufijo = () => ' ' + randomUUID().slice(0, 5);

describe('KAN-28 · Validación de nombre de producto (spec oficial)', () => {
  it('rechaza nombres inválidos: vacío, < 3, o que empiezan con punto/carácter especial', async () => {
    for (const n of ['.PRUEBA123', '.UPBEB125', 'AB', '   ', '-pollo', '@bebida', '_test']) {
      const res = await crear(n);
      expect(res.status, `nombre: "${n}"`).toBe(400);
      expect(res.body.error).toBe('NOMBRE_INVALIDO');
    }
  });

  it('acepta nombres válidos (incluye número o mayúsculas al inicio y símbolos en el cuerpo)', async () => {
    for (const n of ['Pollo a las Brasas', 'COMBO POLLO + PAPAS 900', '7 Up 125ml', 'Bebida UP 125ml']) {
      const res = await crear(n + sufijo());
      expect(res.status, `nombre: "${n}"`).toBe(201);
    }
  });

  it('permite renombrar a un nombre válido y bloquea uno inválido', async () => {
    const prod = (await crear('Producto Temporal' + sufijo())).body;
    const ok = await request(app).put(`/api/products/${prod.id}`).set('Authorization', bearer()).send({ name: 'Bebida Naranja 250ml' });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Bebida Naranja 250ml');
    const bad = await request(app).put(`/api/products/${prod.id}`).set('Authorization', bearer()).send({ name: '.codigo9' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('NOMBRE_INVALIDO');
  });

  it('NO bloquea editar otros campos (foto/visibilidad/precio) sin tocar el nombre', async () => {
    const prod = (await crear('Producto Otro' + sufijo())).body;
    const res = await request(app).put(`/api/products/${prod.id}`).set('Authorization', bearer()).send({ in_catalog: false, price: 1500 });
    expect(res.status).toBe(200);
  });
});
