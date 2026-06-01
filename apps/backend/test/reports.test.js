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

const endpoints = [
  ['turn-summary', ['period_start', 'total', 'by_method']],
  ['closures', null],
  ['cash-flow', ['total_ingresos', 'total_egresos', 'neto', 'por_dia']],
  ['pnl', ['ventas', 'utilidad_bruta', 'gastos_operativos', 'margenes']],
  ['stats', ['total_ventas', 'n_ventas', 'por_hora', 'por_metodo', 'ranking']],
  ['dashboard', ['kpis', 'tendencia', 'top_productos', 'dias_semana']],
];

describe('Reportes de gerencia', () => {
  for (const [ep, keys] of endpoints) {
    it(`GET /reports/${ep} responde 200 a gerencia`, async () => {
      const res = await request(app).get(`/api/reports/${ep}`).set('Authorization', bearer(gerente));
      expect(res.status).toBe(200);
      if (keys) for (const k of keys) expect(res.body).toHaveProperty(k);
      else expect(Array.isArray(res.body)).toBe(true);
    });
  }

  it('el cajero no accede a ningún reporte (reports.view)', async () => {
    for (const [ep] of endpoints) {
      const res = await request(app).get(`/api/reports/${ep}`).set('Authorization', bearer(cajero));
      expect(res.status).toBe(403);
    }
  });
});
