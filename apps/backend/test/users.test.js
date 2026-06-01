import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, token;
const bearer = () => 'Bearer ' + token;
const uname = 'caj_' + randomUUID().slice(0, 6).replace(/-/g, '');
beforeAll(async () => { app = await getApp(); token = (await login(app)).token; });

describe('Gestión de usuarios y permisos', () => {
  let newUserId;

  it('lista usuarios con su rol y estado', async () => {
    const res = await request(app).get('/api/users').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body.some((u) => u.username === 'gerente' && u.role === 'GERENCIA')).toBe(true);
  });

  it('crea un cajero nuevo', async () => {
    const res = await request(app).post('/api/users').set('Authorization', bearer())
      .send({ username: uname, full_name: 'Cajero Nuevo', role: 'CAJERO', password: 'clave123' });
    expect(res.status).toBe(201);
    newUserId = res.body.id;
    expect(res.body.otp_secret).toBeNull(); // sólo gerencia recibe OTP
  });

  it('el cajero nuevo puede iniciar sesión', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: uname, password: 'clave123' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('CAJERO');
  });

  it('rechaza usuario duplicado', async () => {
    const res = await request(app).post('/api/users').set('Authorization', bearer())
      .send({ username: uname, full_name: 'Otro', role: 'CAJERO', password: 'clave123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('USUARIO_DUPLICADO');
  });

  it('resetea la contraseña de un usuario', async () => {
    const res = await request(app).post(`/api/users/${newUserId}/password`).set('Authorization', bearer())
      .send({ password: 'nueva456' });
    expect(res.status).toBe(200);
    const relog = await request(app).post('/api/auth/login').send({ username: uname, password: 'nueva456' });
    expect(relog.status).toBe(200);
  });

  it('anti-lockout: no permite dejar el sistema sin gerencia activa', async () => {
    const users = (await request(app).get('/api/users').set('Authorization', bearer())).body;
    const gerente = users.find((u) => u.username === 'gerente');
    const res = await request(app).put(`/api/users/${gerente.id}`).set('Authorization', bearer())
      .send({ role: 'CAJERO' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ULTIMA_GERENCIA');
  });

  it('rechaza rol inválido al crear', async () => {
    const res = await request(app).post('/api/users').set('Authorization', bearer())
      .send({ username: 'x_' + uname, full_name: 'X', role: 'JEFE', password: 'clave123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ROL_INVALIDO');
  });
});
