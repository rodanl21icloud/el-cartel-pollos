import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, token, ingId;
const bearer = () => 'Bearer ' + token;
const PIN = '4731';

beforeAll(async () => {
  app = await getApp();
  token = (await login(app)).token;
  const ing = await request(app).post('/api/inventory/ingredients').set('Authorization', bearer())
    .send({ name: 'Pollo Stock ' + randomUUID().slice(0, 5), unit: 'unidad', stock_qty: 50, cost_unit: 3500 });
  ingId = ing.body.id;
});

describe('Ajuste de stock auditado con PIN de administrador', () => {
  it('rechaza el ajuste si no hay PIN configurado', async () => {
    const res = await request(app).post(`/api/inventory/ingredients/${ingId}/set-stock`).set('Authorization', bearer())
      .send({ new_qty: 80, reason: 'Ingreso de proveedor', pin: PIN });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PIN_NO_CONFIGURADO');
  });

  it('configura el PIN (gerencia) y no expone el hash', async () => {
    const set = await request(app).put('/api/settings/admin-pin').set('Authorization', bearer()).send({ pin: PIN });
    expect(set.status).toBe(200);
    const s = await request(app).get('/api/settings').set('Authorization', bearer());
    expect(s.body.has_admin_pin).toBe(true);
    expect(s.body.admin_pin_hash).toBeUndefined();
  });

  it('rechaza PIN incorrecto', async () => {
    const res = await request(app).post(`/api/inventory/ingredients/${ingId}/set-stock`).set('Authorization', bearer())
      .send({ new_qty: 80, reason: 'Ingreso de proveedor', pin: '0000' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PIN_INVALIDO');
  });

  it('exige motivo y cantidad válida', async () => {
    const sinMotivo = await request(app).post(`/api/inventory/ingredients/${ingId}/set-stock`).set('Authorization', bearer())
      .send({ new_qty: 80, reason: '  ', pin: PIN });
    expect(sinMotivo.status).toBe(400);
    const malaQty = await request(app).post(`/api/inventory/ingredients/${ingId}/set-stock`).set('Authorization', bearer())
      .send({ new_qty: -5, reason: 'x', pin: PIN });
    expect(malaQty.status).toBe(400);
  });

  it('ajusta el stock con PIN correcto y deja traza en auditoría', async () => {
    const res = await request(app).post(`/api/inventory/ingredients/${ingId}/set-stock`).set('Authorization', bearer())
      .send({ new_qty: 80, reason: 'Ingreso de proveedor', pin: PIN });
    expect(res.status).toBe(201);
    expect(res.body.stock_anterior).toBe(50);
    expect(res.body.stock_nuevo).toBe(80);
    expect(res.body.delta).toBe(30);

    // Stock efectivamente actualizado.
    const list = await request(app).get('/api/inventory/ingredients').set('Authorization', bearer());
    expect(Number(list.body.find((i) => i.id === ingId).stock_qty)).toBe(80);
  });

  it('el cajero no puede ajustar stock (inventory.manage)', async () => {
    const caj = (await login(app, 'cajero1', 'cajero123')).token;
    const res = await request(app).post(`/api/inventory/ingredients/${ingId}/set-stock`).set('Authorization', 'Bearer ' + caj)
      .send({ new_qty: 10, reason: 'x', pin: PIN });
    expect(res.status).toBe(403);
  });
});
