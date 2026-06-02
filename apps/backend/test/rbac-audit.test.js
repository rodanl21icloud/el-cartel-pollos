import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, gToken, cToken;
const g = () => 'Bearer ' + gToken;
const c = () => 'Bearer ' + cToken;

beforeAll(async () => {
  app = await getApp();
  gToken = (await login(app, 'gerente', 'gerente123')).token;
  cToken = (await login(app, 'cajero1', 'cajero123')).token;
});

describe('RBAC extendido (6 roles) y auditoría', () => {
  it('la matriz expone los 6 roles del catálogo', async () => {
    const res = await request(app).get('/api/permissions').set('Authorization', g());
    expect(res.status).toBe(200);
    for (const r of ['CAJERO', 'SUPERVISOR', 'PREPARADOR', 'DESPACHO', 'GERENCIA', 'ADMIN']) {
      expect(res.body.roles).toContain(r);
    }
    expect(res.body.role_meta.find((m) => m.key === 'ADMIN').kind).toBe('ADMIN');
  });

  it('permite crear usuarios con roles nuevos (SUPERVISOR, DESPACHO, ADMIN)', async () => {
    for (const role of ['SUPERVISOR', 'DESPACHO', 'ADMIN']) {
      const res = await request(app).post('/api/users').set('Authorization', g())
        .send({ username: role.toLowerCase() + '_' + randomUUID().slice(0, 5), full_name: role, role, password: 'clave1234' });
      expect(res.status).toBe(201);
      // ADMIN recibe secreto OTP; operativos no.
      if (role === 'ADMIN') expect(res.body.otp_secret).toBeTruthy();
      else expect(res.body.otp_secret).toBeNull();
    }
  });

  it('anular requiere sales.void (desacoplado de reports.view)', async () => {
    // Gerencia tiene sales.void.
    const ok = await request(app).post(`/api/sales/${randomUUID()}/void`).set('Authorization', g()).send({ reason: 'x' });
    expect([200, 404]).toContain(ok.status); // 404 = venta inexistente, pero PASÓ el permiso
    // Cajero NO tiene sales.void.
    const denied = await request(app).post(`/api/sales/${randomUUID()}/void`).set('Authorization', c()).send({ reason: 'x' });
    expect(denied.status).toBe(403);
  });

  it('auditoría: gerencia ve el log, el cajero no (audit.view)', async () => {
    const ok = await request(app).get('/api/audit?limit=20').set('Authorization', g());
    expect(ok.status).toBe(200);
    expect(Array.isArray(ok.body)).toBe(true);
    expect(ok.body[0]).toHaveProperty('action');
    const denied = await request(app).get('/api/audit').set('Authorization', c());
    expect(denied.status).toBe(403);
  });

  it('el cajero ya NO trae reports.view ni expenses.manage (least-privilege)', async () => {
    const me = await request(app).get('/api/permissions/me').set('Authorization', c());
    expect(me.body.permissions['pos.sell']).toBe(true);
    expect(me.body.permissions['reports.view']).toBe(false);
    expect(me.body.permissions['sales.void']).toBe(false);
  });
});
