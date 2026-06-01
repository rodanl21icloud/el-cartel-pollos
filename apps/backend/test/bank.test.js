import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, token;
const bearer = () => 'Bearer ' + token;
beforeAll(async () => {
  app = await getApp();
  token = (await login(app, 'gerente', 'gerente123')).token;
});

describe('Conciliación bancaria', () => {
  let movId;

  it('registra un movimiento manual de ingreso', async () => {
    const before = (await request(app).get('/api/bank/summary').set('Authorization', bearer())).body;
    const res = await request(app).post('/api/bank/movements').set('Authorization', bearer())
      .send({ fecha: '2026-05-01', amount: 100000, direction: 'INGRESO', description: 'Liquidación tarjetas', category: 'Ventas con tarjeta' });
    expect(res.status).toBe(201);
    movId = res.body.id;

    const after = (await request(app).get('/api/bank/summary').set('Authorization', bearer())).body;
    expect(after.pendientes).toBe(before.pendientes + 1);
    expect(after.ingresos).toBeGreaterThanOrEqual(100000);
  });

  it('valida la dirección del movimiento', async () => {
    const res = await request(app).post('/api/bank/movements').set('Authorization', bearer())
      .send({ fecha: '2026-05-01', amount: 1000, direction: 'XX' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DIRECCION_INVALIDA');
  });

  it('marca el movimiento como conciliado', async () => {
    const before = (await request(app).get('/api/bank/summary').set('Authorization', bearer())).body;
    const res = await request(app).put(`/api/bank/movements/${movId}/reconcile`).set('Authorization', bearer())
      .send({ reconciled: true });
    expect(res.status).toBe(200);
    expect(res.body.reconciled).toBe(true);

    const after = (await request(app).get('/api/bank/summary').set('Authorization', bearer())).body;
    expect(after.conciliados).toBe(before.conciliados + 1);
    expect(after.pendientes).toBe(before.pendientes - 1);
  });

  it('compara banco vs sistema por mes', async () => {
    const res = await request(app).get('/api/bank/reconcile').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
