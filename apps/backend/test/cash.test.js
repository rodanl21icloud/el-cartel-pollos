import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, gerente, cajero;
beforeAll(async () => {
  app = await getApp();
  gerente = await login(app, 'gerente', 'gerente123');
  cajero = await login(app, 'cajero1', 'cajero123');
});
const bearer = (t) => 'Bearer ' + t;

describe('Caja: apertura y cierre ciego', () => {
  it('el cajero cierra a ciegas (sin ver el teórico)', async () => {
    const open = await request(app).post('/api/cash-register/open').set('Authorization', bearer(cajero.token))
      .send({ opening_float: 50000 });
    expect(open.status).toBe(201);

    const close = await request(app).post('/api/cash-register/close').set('Authorization', bearer(cajero.token))
      .send({ efectivo_declarado: 50000, pos_declarado: 0, transferencias_declaradas: 0 });
    expect(close.status).toBe(201);
    expect(close.body.blind).toBe(true);
    expect(close.body.teorico).toBeUndefined();
    expect(close.body.resumen_turno).toBeUndefined();
  });

  it('rechaza un conteo por denominación que no cuadra con el fondo', async () => {
    const res = await request(app).post('/api/cash-register/open').set('Authorization', bearer(gerente.token))
      .send({ opening_float: 10000, detail: { 5000: 1 } }); // 5000 ≠ 10000
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CONTEO_NO_CUADRA');
  });

  it('la gerencia recibe el resumen del turno con teórico y diferencias', async () => {
    const open = await request(app).post('/api/cash-register/open').set('Authorization', bearer(gerente.token))
      .send({ opening_float: 10000 });
    expect(open.status).toBe(201);

    const close = await request(app).post('/api/cash-register/close').set('Authorization', bearer(gerente.token))
      .send({ efectivo_declarado: 10000, pos_declarado: 0, transferencias_declaradas: 0 });
    expect(close.status).toBe(201);
    expect(close.body.teorico).toBeDefined();
    expect(close.body.resumen_turno).toBeDefined();
    expect(close.body.diferencias.efectivo).toBe(0); // 10000 declarado = fondo, sin ventas
  });

  it('no permite abrir dos cajas a la vez', async () => {
    const a = await request(app).post('/api/cash-register/open').set('Authorization', bearer(gerente.token))
      .send({ opening_float: 1000 });
    expect(a.status).toBe(201);
    const b = await request(app).post('/api/cash-register/open').set('Authorization', bearer(gerente.token))
      .send({ opening_float: 1000 });
    expect(b.status).toBe(409);
    expect(b.body.error).toBe('CAJA_YA_ABIERTA');
    // Cerrar para dejar la caja libre.
    await request(app).post('/api/cash-register/close').set('Authorization', bearer(gerente.token))
      .send({ efectivo_declarado: 1000, pos_declarado: 0, transferencias_declaradas: 0 });
  });
});
