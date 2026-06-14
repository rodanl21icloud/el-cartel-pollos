// Fase 1 (D2C) — Motor de fidelización: cashback %.
//  - Devengo = round(total * pct/100) al confirmar venta con cliente.
//  - Idempotente por venta.
//  - Tier por acumulado histórico (no baja al canjear).
//  - Billetera PÚBLICA por teléfono (privacidad: solo primer nombre).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login, signSale } from './helpers.js';
import { getDb } from '../src/db.js';
import { loyaltyMove } from '../src/services/marketing/commercial.js';

let app, cajero, gtoken, p10k, p300k;
const bearer = (t) => 'Bearer ' + t;
const saleIds = [];

const saleBody = (productId, extra = {}) => ({
  client_uuid: randomUUID(), payment_method: 'EFECTIVO', sold_at: new Date().toISOString(),
  items: [{ product_id: productId, qty: 1 }], ...extra,
});

async function clientIdByPhone(phone) {
  const r = (await getDb().execute({ sql: `SELECT id FROM clients WHERE phone = ?`, args: [phone] })).rows[0];
  return r?.id;
}

beforeAll(async () => {
  app = await getApp();
  cajero = await login(app, 'cajero1', 'cajero123');
  gtoken = (await login(app, 'gerente', 'gerente123')).token;
  const a = await request(app).post('/api/products').set('Authorization', bearer(gtoken))
    .send({ name: 'Loyal 10k ' + randomUUID().slice(0, 6), price: 10000 });
  p10k = a.body.id;
  const b = await request(app).post('/api/products').set('Authorization', bearer(gtoken))
    .send({ name: 'Loyal 300k ' + randomUUID().slice(0, 6), price: 300000 });
  p300k = b.body.id;
});

afterAll(async () => {
  for (const id of saleIds) {
    try { await request(app).post(`/api/sales/${id}/void`).set('Authorization', bearer(gtoken)).send({ reason: 'cleanup test' }); } catch { /* */ }
  }
});

describe('Cashback de fidelización', () => {
  it('devenga 5% del total a la billetera del cliente y la expone por teléfono (solo primer nombre)', async () => {
    const phone = '+56911112222';
    const body = signSale(saleBody(p10k, { client: { phone, name: 'Juan Pérez González' } }), cajero.session);
    const res = await request(app).post('/api/sales/sync').set('Authorization', bearer(cajero.token)).send(body);
    expect(res.status).toBe(201);
    saleIds.push(res.body.sale_id);

    const w = await request(app).get('/api/public/clients/56911112222/wallet'); // sin auth
    expect(w.status).toBe(200);
    expect(w.body.found).toBe(true);
    expect(w.body.points).toBe(500);         // round(10000 * 5 / 100)
    expect(w.body.tier).toBe('BRONCE');
    expect(w.body.cashback_pct).toBe(5);
    expect(w.body.name).toBe('Juan');         // privacidad: solo primer nombre
  });

  it('es idempotente: re-sincronizar la misma venta no duplica el cashback', async () => {
    const phone = '+56933334444';
    const body = signSale(saleBody(p10k, { client: { phone, name: 'Ana Soto' } }), cajero.session);
    const r1 = await request(app).post('/api/sales/sync').set('Authorization', bearer(cajero.token)).send(body);
    expect(r1.status).toBe(201); saleIds.push(r1.body.sale_id);
    const r2 = await request(app).post('/api/sales/sync').set('Authorization', bearer(cajero.token)).send(body);
    expect(r2.status).toBe(200); // DUPLICATE

    const w = await request(app).get('/api/public/clients/56933334444/wallet');
    expect(w.body.points).toBe(500); // no se duplicó
  });

  it('el tier se calcula por acumulado histórico y NO baja al canjear', async () => {
    const phone = '+56955556666';
    const body = signSale(saleBody(p300k, { client: { phone, name: 'Pedro Pollo' } }), cajero.session);
    const res = await request(app).post('/api/sales/sync').set('Authorization', bearer(cajero.token)).send(body);
    expect(res.status).toBe(201); saleIds.push(res.body.sale_id);

    let w = await request(app).get('/api/public/clients/56955556666/wallet');
    expect(w.body.points).toBe(15000); // 5% de 300.000
    expect(w.body.tier).toBe('PLATA');

    // Canje de 10.000 -> saldo baja, pero el tier (histórico EARN=15.000) se mantiene.
    const clientId = await clientIdByPhone(phone);
    await loyaltyMove({ clientId, type: 'REDEEM', points: 10000, reason: 'canje test' });

    w = await request(app).get('/api/public/clients/56955556666/wallet');
    expect(w.body.points).toBe(5000);
    expect(w.body.tier).toBe('PLATA'); // NO bajó a BRONCE
  });

  it('billetera no encontrada devuelve found=false con saldo 0', async () => {
    const w = await request(app).get('/api/public/clients/56999990000/wallet');
    expect(w.status).toBe(200);
    expect(w.body.found).toBe(false);
    expect(w.body.points).toBe(0);
  });

  it('rechaza teléfono inválido (400)', async () => {
    const w = await request(app).get('/api/public/clients/123/wallet');
    expect(w.status).toBe(400);
    expect(w.body.error).toBe('TELEFONO_INVALIDO');
  });
});
