import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, gerente, cajero;
const bearer = (t) => 'Bearer ' + t;
beforeAll(async () => {
  app = await getApp();
  gerente = (await login(app, 'gerente', 'gerente123')).token;
  cajero = (await login(app, 'cajero1', 'cajero123')).token;
});

describe('Datos del negocio (settings)', () => {
  it('cualquier autenticado puede leer los datos', async () => {
    const res = await request(app).get('/api/settings').set('Authorization', bearer(cajero));
    expect(res.status).toBe(200);
    expect(res.body.name).toBeTruthy();
  });

  it('la gerencia actualiza los datos', async () => {
    const res = await request(app).put('/api/settings').set('Authorization', bearer(gerente))
      .send({ name: 'El Cartel de los Pollos', phone: '+56 9 1111 2222', paper_width: 58 });
    expect(res.status).toBe(200);
    expect(res.body.paper_width).toBe(58);
    expect(res.body.phone).toBe('+56 9 1111 2222');
  });

  it('rechaza un ancho de papel inválido', async () => {
    const res = await request(app).put('/api/settings').set('Authorization', bearer(gerente))
      .send({ paper_width: 72 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ANCHO_INVALIDO');
  });

  it('el cajero no puede editar (sin permiso settings.manage)', async () => {
    const res = await request(app).put('/api/settings').set('Authorization', bearer(cajero))
      .send({ name: 'Hackeado' });
    expect(res.status).toBe(403);
  });
});
