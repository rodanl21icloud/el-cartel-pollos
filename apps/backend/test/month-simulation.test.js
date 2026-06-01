// ============================================================
// Simulación de un MES completo de operación (28 días).
// Genera ventas reales firmadas (HMAC) con receta/BOM, gastos y retiros,
// repartidos en una ventana en el PASADO para aislarla de los demás tests
// (que operan "hoy"). Luego valida que TODA la reportería cuadre con lo
// generado: estadísticas, flujo de caja, P&L, dashboard e inventario.
// ============================================================
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { getApp, login, signSale } from './helpers.js';

let app, token, sess;
const bearer = () => 'Bearer ' + token;
const rnd6 = () => randomUUID().slice(0, 6);

// PRNG determinista (LCG) para reproducibilidad de la simulación.
let _seed = 123456789;
const rng = () => (_seed = (_seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (arr) => arr[Math.floor(rng() * arr.length)];

const DAY = 86400000;
const now = Date.now();
const DAYS = 28;
// Ventana pasada: días -40..-13 (no se solapa con las ventas "de hoy" de otros tests).
const dayDate = (i) => { const d = new Date(now - (40 - i) * DAY); d.setUTCHours(16, 0, 0, 0); return d; };
const FROM = new Date(now - 41 * DAY).toISOString();
const TO = new Date(now - 12 * DAY).toISOString();

// Insumos exclusivos de la simulación (solo los consumen estas ventas).
const ING = {
  pollo:   { id: null, cost: 3500, stock0: 100000 },
  papas:   { id: null, cost: 2,    stock0: 1000000 },
  empaque: { id: null, cost: 150,  stock0: 100000 },
};
// Productos con receta (qty enteras -> COGS entero y exacto).
const MENU = [
  { id: null, name: 'Pollo Entero Sim',  price: 12000, recipe: { pollo: 1, papas: 600, empaque: 1 } },
  { id: null, name: 'Medio Pollo Sim',   price: 7000,  recipe: { pollo: 1, empaque: 1 } },
  { id: null, name: 'Papas Familia Sim', price: 4000,  recipe: { papas: 300, empaque: 1 } },
];
const METHODS = ['EFECTIVO', 'POS', 'TRANSFERENCIA'];

// Acumuladores de lo esperado.
const exp = {
  total: 0, count: 0,
  byMethod: { EFECTIVO: { n: 0, monto: 0 }, POS: { n: 0, monto: 0 }, TRANSFERENCIA: { n: 0, monto: 0 } },
  cons: { pollo: 0, papas: 0, empaque: 0 },
  cogs: 0,
  expOper: 0, expRetiro: 0, expAll: 0,
};
const prodCost = (p) => Object.entries(p.recipe).reduce((s, [k, q]) => s + ING[k].cost * q, 0);

beforeAll(async () => {
  app = await getApp();
  const g = await login(app);
  token = g.token; sess = g.session;

  // Crear insumos.
  for (const [key, ing] of Object.entries(ING)) {
    const unit = key === 'papas' ? 'gramo' : (key === 'empaque' ? 'empaque' : 'unidad');
    const res = await request(app).post('/api/inventory/ingredients').set('Authorization', bearer())
      .send({ name: `${key}-sim-${rnd6()}`, unit, stock_qty: ing.stock0, min_stock_qty: 0, cost_unit: ing.cost });
    expect(res.status).toBe(201);
    ing.id = res.body.id;
  }
  // Crear productos + receta.
  for (const p of MENU) {
    const res = await request(app).post('/api/products').set('Authorization', bearer())
      .send({ name: `${p.name} ${rnd6()}`, price: p.price });
    expect(res.status).toBe(201);
    p.id = res.body.id;
    const lines = Object.entries(p.recipe).map(([k, q]) => ({ ingredient_id: ING[k].id, qty_per_unit: q }));
    const rc = await request(app).put(`/api/products/${p.id}/recipe`).set('Authorization', bearer()).send({ lines });
    expect(rc.status).toBe(200);
  }

  // --- Operación diaria del mes ---
  for (let i = 0; i < DAYS; i++) {
    const soldAt = dayDate(i).toISOString();
    const nVentas = 3 + Math.floor(rng() * 4); // 3..6 ventas/día
    for (let v = 0; v < nVentas; v++) {
      const p = pick(MENU);
      const qty = 1 + Math.floor(rng() * 3); // 1..3
      const method = pick(METHODS);
      const body = signSale({
        client_uuid: randomUUID(), payment_method: method, sold_at: soldAt,
        items: [{ product_id: p.id, qty }],
      }, sess);
      const res = await request(app).post('/api/sales/sync').set('Authorization', bearer()).send(body);
      expect(res.status).toBe(201);

      const lineTotal = p.price * qty;
      exp.total += lineTotal; exp.count += 1;
      exp.byMethod[method].n += 1; exp.byMethod[method].monto += lineTotal;
      for (const [k, q] of Object.entries(p.recipe)) { exp.cons[k] += q * qty; }
      exp.cogs += prodCost(p) * qty;
    }
    // Gastos operativos cada 4 días; retiros cada 9 días.
    if (i % 4 === 0) {
      const amount = 50000;
      const e = await request(app).post('/api/expenses').set('Authorization', bearer())
        .send({ category_id: 'cat-arriendo', amount, payment_method: 'TRANSFERENCIA', description: 'Servicios', spent_at: soldAt });
      expect(e.status).toBe(201);
      exp.expOper += amount; exp.expAll += amount;
    }
    if (i % 9 === 0) {
      const amount = 100000;
      const e = await request(app).post('/api/expenses').set('Authorization', bearer())
        .send({ category_id: 'cat-retiros', amount, payment_method: 'EFECTIVO', description: 'Retiro socio', spent_at: soldAt });
      expect(e.status).toBe(201);
      exp.expRetiro += amount; exp.expAll += amount;
    }
  }
}, 60000);

const q = (ep) => request(app).get(`/api/reports/${ep}`).query({ from: FROM, to: TO }).set('Authorization', bearer());

describe('Simulación de un mes de operación', () => {
  it('generó datos en los 28 días', () => {
    expect(exp.count).toBeGreaterThanOrEqual(DAYS * 3);
    expect(exp.total).toBeGreaterThan(0);
  });

  it('estadísticas: total, número de ventas, días y métodos cuadran exactamente', async () => {
    const res = await q('stats');
    expect(res.status).toBe(200);
    expect(res.body.n_ventas).toBe(exp.count);
    expect(res.body.total_ventas).toBe(exp.total);
    expect(res.body.por_dia).toHaveLength(DAYS);
    for (const m of METHODS) {
      const row = res.body.por_metodo.find((x) => x.metodo === m);
      expect(row.ventas).toBe(exp.byMethod[m].n);
      expect(row.monto).toBe(exp.byMethod[m].monto);
    }
    // El ticket promedio es consistente.
    expect(res.body.ticket_promedio).toBeCloseTo(exp.total / exp.count, 1);
  });

  it('flujo de caja: ingresos = ventas, egresos = todos los gastos, neto correcto', async () => {
    const res = await q('cash-flow');
    expect(res.status).toBe(200);
    expect(res.body.total_ingresos).toBe(exp.total);
    expect(res.body.total_egresos).toBe(exp.expAll);
    expect(res.body.neto).toBe(exp.total - exp.expAll);
  });

  it('P&L: ventas, gastos operativos y retiros separados correctamente', async () => {
    const res = await q('pnl');
    expect(res.status).toBe(200);
    expect(res.body.ventas).toBe(exp.total);
    expect(res.body.gastos_operativos).toBe(exp.expOper);
    expect(res.body.retiros).toBe(exp.expRetiro);
    expect(res.body.utilidad_bruta).toBe(exp.total - res.body.costo_insumos);
  });

  it('dashboard ejecutivo: KPIs de ventas y número de ventas coinciden', async () => {
    const res = await q('dashboard');
    expect(res.status).toBe(200);
    expect(res.body.kpis.ventas).toBe(exp.total);
    expect(res.body.kpis.n_ventas).toBe(exp.count);
  });

  it('inventario: el stock descontado por BOM coincide con lo vendido (exacto)', async () => {
    const list = (await request(app).get('/api/inventory/ingredients').set('Authorization', bearer())).body;
    for (const [k, ing] of Object.entries(ING)) {
      const row = list.find((x) => x.id === ing.id);
      expect(Number(row.stock_qty)).toBe(ing.stock0 - exp.cons[k]);
    }
  });

  it('COGS por BOM se acumula globalmente (costo congelado por venta)', async () => {
    // Ventana por defecto (incluye hoy, cuando se sellaron los ajustes de inventario).
    const res = await request(app).get('/api/reports/pnl').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body.costo_insumos).toBeGreaterThanOrEqual(exp.cogs);
  });
});
