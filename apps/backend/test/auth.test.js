import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app;
beforeAll(async () => { app = await getApp(); });

describe('Autenticación', () => {
  it('login válido devuelve token y clave de sesión', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'gerente', password: 'gerente123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.session?.id).toBeTruthy();
    expect(res.body.session?.key).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.user.role).toBe('GERENCIA');
  });

  it('rechaza contraseña incorrecta', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'gerente', password: 'mala' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('CREDENCIALES_INVALIDAS');
  });

  it('exige JWT en /api', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });

  it('/permissions/me devuelve permisos del rol', async () => {
    const { token } = await login(app, 'gerente');
    const res = await request(app).get('/api/permissions/me').set('Authorization', 'Bearer ' + token);
    expect(res.status).toBe(200);
    expect(res.body.permissions['pos.sell']).toBe(true);
    expect(res.body.permissions['permissions.manage']).toBe(true);
  });
});
