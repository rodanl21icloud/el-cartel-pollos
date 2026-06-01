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

describe('Permisos por módulo', () => {
  it('el cajero NO puede ver P&L (reports.view)', async () => {
    const res = await request(app).get('/api/reports/pnl').set('Authorization', bearer(cajero.token));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PERMISO_DENEGADO');
  });

  it('la gerencia SÍ puede ver P&L', async () => {
    const res = await request(app).get('/api/reports/pnl').set('Authorization', bearer(gerente.token));
    expect(res.status).toBe(200);
  });

  it('conceder reports.view al cajero lo habilita, y se puede revocar', async () => {
    // Conceder (gerencia pasa OTP directo).
    const grant = await request(app).put('/api/permissions').set('Authorization', bearer(gerente.token))
      .send({ role: 'CAJERO', permission: 'reports.view', allowed: true });
    expect(grant.status).toBe(200);

    const ok = await request(app).get('/api/reports/pnl').set('Authorization', bearer(cajero.token));
    expect(ok.status).toBe(200);

    // Revocar para no contaminar otros tests.
    const revoke = await request(app).put('/api/permissions').set('Authorization', bearer(gerente.token))
      .send({ role: 'CAJERO', permission: 'reports.view', allowed: false });
    expect(revoke.status).toBe(200);

    const denied = await request(app).get('/api/reports/pnl').set('Authorization', bearer(cajero.token));
    expect(denied.status).toBe(403);
  });

  it('anti-lockout: la gerencia no puede quitarse permissions.manage', async () => {
    const res = await request(app).put('/api/permissions').set('Authorization', bearer(gerente.token))
      .send({ role: 'GERENCIA', permission: 'permissions.manage', allowed: false });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NO_PUEDES_BLOQUEAR_GERENCIA');
  });
});
