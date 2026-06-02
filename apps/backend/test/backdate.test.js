import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login } from './helpers.js';

let app, token, productId;
const bearer = () => 'Bearer ' + token;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86_400_000;

beforeAll(async () => {
  app = await getApp();
  token = (await login(app)).token;
  const p = await request(app).post('/api/products').set('Authorization', bearer())
    .send({ name: 'Retro Item ' + randomUUID().slice(0, 6), price: 5000 });
  productId = p.body.id;
});

const base = (over = {}) => ({
  client_uuid: randomUUID(), sold_at: iso(DAY), reason: 'venta no ingresada por falla',
  payment_method: 'EFECTIVO', items: [{ product_id: productId, qty: 2 }], ...over,
});

describe('Venta retroactiva (HU-VTA-07)', () => {
  let backSaleId;

  it('gerencia registra una venta de ayer (marcada retroactiva, día histórico)', async () => {
    const res = await request(app).post('/api/sales/backdate').set('Authorization', bearer()).send(base());
    expect(res.status).toBe(201);
    expect(res.body.backdated).toBe(true);
    expect(res.body.total).toBe(10000);
    expect(res.body.business_day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    backSaleId = res.body.sale_id;
  });

  it('queda marcada en el listado de ventas con su motivo', async () => {
    const list = await request(app).get('/api/sales').set('Authorization', bearer());
    const v = list.body.find((x) => x.id === backSaleId);
    expect(v.is_backdated).toBe(true);
    expect(v.backdate_reason).toBe('venta no ingresada por falla');
    expect(v.created_at).toBeTruthy(); // fecha real de ingreso
  });

  it('queda auditada como SALE_BACKDATE (ALERT) con ambas fechas', async () => {
    const a = await request(app).get('/api/audit?action=SALE_BACKDATE&limit=5').set('Authorization', bearer());
    const ev = a.body.find((e) => e.entity_id === backSaleId);
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('ALERT');
    expect(ev.metadata.sold_at).toBeTruthy();
    expect(ev.metadata.registrado_at).toBeTruthy();
  });

  it('rechaza fecha futura', async () => {
    const res = await request(app).post('/api/sales/backdate').set('Authorization', bearer())
      .send(base({ sold_at: new Date(Date.now() + DAY).toISOString() }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('FECHA_FUTURA');
  });

  it('rechaza más de 30 días atrás', async () => {
    const res = await request(app).post('/api/sales/backdate').set('Authorization', bearer())
      .send(base({ sold_at: iso(40 * DAY) }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('FECHA_DEMASIADO_ANTIGUA');
  });

  it('exige motivo', async () => {
    const res = await request(app).post('/api/sales/backdate').set('Authorization', bearer())
      .send(base({ reason: '   ' }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MOTIVO_OBLIGATORIO');
  });

  it('el cajero NO puede registrar ventas retroactivas (sales.backdate)', async () => {
    const caj = (await login(app, 'cajero1', 'cajero123')).token;
    const res = await request(app).post('/api/sales/backdate').set('Authorization', 'Bearer ' + caj).send(base());
    expect(res.status).toBe(403);
  });
});
