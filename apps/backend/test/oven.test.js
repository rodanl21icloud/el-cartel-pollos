// F-E — Producción de pollo (oven_batch): registrar lotes horno/precocido + agregados.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { getApp, login } from './helpers.js';
import { getDb } from '../src/db.js';

let app, token;
const bearer = (t) => 'Bearer ' + t;
const created = [];

beforeAll(async () => {
  app = await getApp();
  token = (await login(app, 'gerente', 'gerente123')).token; // tiene dispatch.manage
});

afterAll(async () => {
  for (const id of created) {
    try { await getDb().execute({ sql: `DELETE FROM oven_batch WHERE id=?`, args: [id] }); } catch { /* */ }
  }
});

describe('Producción de pollo (oven_batch)', () => {
  it('registra lotes al horno y precocidos, y agrega por tipo', async () => {
    const a = await request(app).post('/api/oven').set('Authorization', bearer(token)).send({ kind: 'HORNO', qty: 10 });
    expect(a.status).toBe(201); created.push(a.body.id);
    const b = await request(app).post('/api/oven').set('Authorization', bearer(token)).send({ kind: 'PRECOCIDO', qty: 4, note: 'p/ mañana' });
    expect(b.status).toBe(201); created.push(b.body.id);

    const t = await request(app).get('/api/oven/today').set('Authorization', bearer(token));
    expect(t.status).toBe(200);
    expect(t.body.horno).toBeGreaterThanOrEqual(10);
    expect(t.body.precocido).toBeGreaterThanOrEqual(4);
    expect(t.body.batches.length).toBeGreaterThanOrEqual(2);
  });

  it('rechaza tipo y cantidad inválidos', async () => {
    const t = await request(app).post('/api/oven').set('Authorization', bearer(token)).send({ kind: 'X', qty: 1 });
    expect(t.status).toBe(400);
    const c = await request(app).post('/api/oven').set('Authorization', bearer(token)).send({ kind: 'HORNO', qty: 0 });
    expect(c.status).toBe(400);
  });
});
