// Fase 1 — Sellado de seguridad y trazabilidad.
//  1.1 Logout revoca la clave HMAC.
//  1.2 Control de descuentos (umbral % + supervisor) + audita SALE_DISCOUNT.
//  1.3 Cadena antifraude en audit_logs + verificación + detección de manipulación.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { getApp, login, signSale } from './helpers.js';
import { getDb } from '../src/db.js';

let app, gtoken, productId;
const bearer = (t) => 'Bearer ' + t;
const createdSales = [];

beforeAll(async () => {
  app = await getApp();
  const g = await login(app, 'gerente', 'gerente123'); gtoken = g.token;
  // Supervisor con poder de autorizar descuentos (no toca la matriz de roles).
  await getDb().execute({
    sql: `INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, otp_secret) VALUES (?,?,?,?,?,?)`,
    args: [randomUUID(), 'sup1', await bcrypt.hash('sup123', 4), 'Supervisor', 'SUPERVISOR', null],
  });
  // Producto sin receta, precio redondo para controlar el subtotal.
  const prod = await request(app).post('/api/products').set('Authorization', bearer(gtoken))
    .send({ name: 'Prod Desc ' + randomUUID().slice(0, 6), price: 10000 });
  productId = prod.body.id;
});

// Anula las ventas creadas para no contaminar reportes de otros tests.
afterAll(async () => {
  for (const id of createdSales) {
    try { await request(app).post(`/api/sales/${id}/void`).set('Authorization', bearer(gtoken)).send({ reason: 'cleanup test' }); } catch { /* */ }
  }
});

const saleBody = (extra = {}) => ({
  client_uuid: randomUUID(), payment_method: 'EFECTIVO', sold_at: new Date().toISOString(),
  items: [{ product_id: productId, qty: 1 }], ...extra,
});

describe('1.1 Logout real', () => {
  it('revoca la clave HMAC: la sesión ya no puede firmar ventas', async () => {
    const c = await login(app, 'cajero1', 'cajero123');
    const lo = await request(app).post('/api/auth/logout').set('Authorization', bearer(c.token)).send({ sessionId: c.session.id });
    expect(lo.status).toBe(200);
    const body = signSale(saleBody(), c.session);
    const res = await request(app).post('/api/sales/sync').set('Authorization', bearer(c.token)).send(body);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SESION_NO_VALIDA');
  });
});

describe('1.2 Control de descuentos', () => {
  it('descuento ≤15% no exige supervisor', async () => {
    const c = await login(app, 'cajero1', 'cajero123');
    const res = await request(app).post('/api/sales/sync').set('Authorization', bearer(c.token))
      .send(signSale(saleBody({ discount: 1000 }), c.session)); // 10% de 10.000
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(9000);
    createdSales.push(res.body.sale_id);
  });

  it('descuento >15% sin supervisor → 403 DISCOUNT_REQUIRES_SUPERVISOR', async () => {
    const c = await login(app, 'cajero1', 'cajero123');
    const res = await request(app).post('/api/sales/sync').set('Authorization', bearer(c.token))
      .send(signSale(saleBody({ discount: 3000 }), c.session)); // 30%
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('DISCOUNT_REQUIRES_SUPERVISOR');
  });

  it('descuento >15% con credenciales NO-supervisor → 403', async () => {
    const c = await login(app, 'cajero1', 'cajero123');
    const res = await request(app).post('/api/sales/sync').set('Authorization', bearer(c.token))
      .send(signSale(saleBody({ discount: 3000, supervisor_auth: { username: 'cajero1', password: 'cajero123' } }), c.session));
    expect(res.status).toBe(403);
  });

  it('descuento >15% con supervisor válido → 201 y audita SALE_DISCOUNT (sin filtrar la contraseña)', async () => {
    const c = await login(app, 'cajero1', 'cajero123');
    const res = await request(app).post('/api/sales/sync').set('Authorization', bearer(c.token))
      .send(signSale(saleBody({ discount: 3000, supervisor_auth: { username: 'sup1', password: 'sup123' } }), c.session));
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(7000);
    createdSales.push(res.body.sale_id);

    const row = (await getDb().execute(
      `SELECT severity, metadata, record_hash FROM audit_logs WHERE action='SALE_DISCOUNT' ORDER BY rowid DESC LIMIT 1`
    )).rows[0];
    expect(row).toBeTruthy();
    expect(row.severity).toBe('ALERT');
    expect(row.metadata).not.toContain('sup123');     // jamás la contraseña
    expect(row.record_hash).toMatch(/^[0-9a-f]{64}$/); // encadenado
  });
});

describe('1.3 Cadena antifraude', () => {
  it('cada audit queda encadenado y /audit/verify confirma integridad', async () => {
    const last = (await getDb().execute(
      `SELECT prev_hash, record_hash FROM audit_logs WHERE record_hash IS NOT NULL ORDER BY rowid DESC LIMIT 1`
    )).rows[0];
    expect(last.record_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(last.prev_hash).toMatch(/^[0-9a-f]{64}$/);

    const v = await request(app).get('/api/audit/verify').set('Authorization', bearer(gtoken));
    expect(v.status).toBe(200);
    expect(v.body.ok).toBe(true);
    expect(v.body.verified).toBeGreaterThan(0);
  });

  // Debe ir AL FINAL: rompe la cadena de forma irreversible (append-only no permite limpiar).
  it('detecta una fila FORJADA insertada a nivel de archivo', async () => {
    await getDb().execute({
      sql: `INSERT INTO audit_logs (id, user_id, action, entity, severity, created_at, prev_hash, record_hash)
            VALUES (?,?,?,?,?,?,?,?)`,
      args: [randomUUID(), null, 'FORGED', 'hack', 'ALERT', new Date().toISOString(), 'deadbeef', 'deadbeef'],
    });
    const v = await request(app).get('/api/audit/verify').set('Authorization', bearer(gtoken));
    expect(v.status).toBe(200);
    expect(v.body.ok).toBe(false);
    expect(v.body.reason).toMatch(/prev_hash|record_hash/);
  });
});
