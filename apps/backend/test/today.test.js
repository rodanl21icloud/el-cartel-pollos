// F-B — "Hoy" (centro de mando). El endpoint compone KPIs del día y exige reports.view.
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, gtoken, ctoken;
const bearer = (t) => 'Bearer ' + t;

beforeAll(async () => {
  app = await getApp();
  gtoken = (await login(app, 'gerente', 'gerente123')).token;
  ctoken = (await login(app, 'cajero1', 'cajero123')).token;
});

describe('GET /api/today', () => {
  it('devuelve el panel del día con todas las secciones (gerencia)', async () => {
    const r = await request(app).get('/api/today').set('Authorization', bearer(gtoken));
    expect(r.status).toBe(200);
    for (const k of ['day', 'ventas', 'pagos', 'pedidos_activos', 'food_cost_pct', 'caja', 'horno', 'top', 'stock_critico', 'incidencias', 'alerts']) {
      expect(r.body).toHaveProperty(k);
    }
    expect(r.body.ventas).toHaveProperty('ticket');
    expect(Array.isArray(r.body.alerts)).toBe(true);
    // Caja sin abrir en el harness -> debe haber alerta roja de caja.
    expect(r.body.alerts.some((a) => a.area === 'Caja' && a.level === 'red')).toBe(true);
  });

  it('niega acceso a un rol sin reports.view (cajero -> 403)', async () => {
    const r = await request(app).get('/api/today').set('Authorization', bearer(ctoken));
    expect(r.status).toBe(403);
  });
});
