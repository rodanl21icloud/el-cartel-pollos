// ============================================================
// Módulo Comercial/Marketing — lógica de negocio.
// REUTILIZA clients, sales, sale_items, products. La segmentación es DINÁMICA
// (RFM calculado), no se persiste. Solo persiste campaigns + loyalty.
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db.js';

const round0 = (n) => Math.round(n || 0);
const DORMANT_DAYS = 45;
const VIP_ORDERS = 5;
const FREQ_ORDERS = 3;

// Segmento RFM-lite a partir de métricas de cliente.
function segmentOf({ n_orders, recency_days, first_days }) {
  if (recency_days != null && recency_days > DORMANT_DAYS) return 'dormido';
  if (n_orders >= VIP_ORDERS) return 'vip';
  if (n_orders >= FREQ_ORDERS) return 'frecuente';
  if (first_days != null && first_days <= 30 && n_orders <= 1) return 'nuevo';
  return 'ocasional';
}
export const SEGMENTS = ['vip', 'frecuente', 'nuevo', 'ocasional', 'dormido'];

/** Métricas comerciales del período (KPIs del dashboard). */
export async function dashboard({ from, to }) {
  const db = getDb();
  const f = from || new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const t = to || new Date().toISOString();

  const agg = (await db.execute({
    sql: `SELECT COUNT(*) orders, COALESCE(SUM(total),0) revenue,
                 COUNT(DISTINCT client_id) unique_customers
          FROM sales WHERE status='CONFIRMADA' AND sold_at>=? AND sold_at<=?`,
    args: [f, t],
  })).rows[0];
  const orders = Number(agg.orders), revenue = round0(Number(agg.revenue));
  const unique_customers = Number(agg.unique_customers);

  // Nuevos = clientes cuya PRIMERA venta de la vida cae en el período.
  const new_customers = Number((await db.execute({
    sql: `SELECT COUNT(*) n FROM (
            SELECT client_id, MIN(sold_at) first FROM sales WHERE status='CONFIRMADA' AND client_id IS NOT NULL GROUP BY client_id
          ) WHERE first>=? AND first<=?`,
    args: [f, t],
  })).rows[0].n);

  // Recurrentes = clientes del período con >1 venta en su vida.
  const repeat_customers = Number((await db.execute({
    sql: `SELECT COUNT(*) n FROM (
            SELECT s.client_id FROM sales s
            WHERE s.status='CONFIRMADA' AND s.client_id IS NOT NULL AND s.sold_at>=? AND s.sold_at<=?
            GROUP BY s.client_id
            HAVING (SELECT COUNT(*) FROM sales s2 WHERE s2.client_id=s.client_id AND s2.status='CONFIRMADA') > 1
          )`,
    args: [f, t],
  })).rows[0].n);

  // Dormidos (lifetime): última compra hace > DORMANT_DAYS.
  const dormant = Number((await db.execute({
    sql: `SELECT COUNT(*) n FROM (
            SELECT client_id, MAX(sold_at) last FROM sales WHERE status='CONFIRMADA' AND client_id IS NOT NULL GROUP BY client_id
          ) WHERE julianday('now') - julianday(last) > ?`,
    args: [DORMANT_DAYS],
  })).rows[0].n);

  const active_campaigns = Number((await db.execute(`SELECT COUNT(*) n FROM campaigns WHERE status='activa'`)).rows[0].n);

  return {
    period: { from: f, to: t }, generated_at: new Date().toISOString(),
    kpis: {
      revenue, orders, unique_customers, new_customers, repeat_customers,
      avg_order_value: orders ? round0(revenue / orders) : 0,
      purchase_frequency: unique_customers ? Math.round((orders / unique_customers) * 10) / 10 : 0,
      dormant_customers: dormant,
      active_campaigns,
    },
    notes: ['Las ventas sin cliente identificado no cuentan en métricas por cliente.'],
  };
}

/** Clientes con métricas + segmento dinámico (opcionalmente filtrado por segmento). */
export async function customers({ segment } = {}) {
  const db = getDb();
  const rows = (await db.execute(`
    SELECT c.id, c.name, c.phone,
           COUNT(s.id) n_orders,
           COALESCE(SUM(s.total),0) total_spent,
           MAX(s.sold_at) last_order,
           MIN(s.sold_at) first_order
    FROM clients c
    LEFT JOIN sales s ON s.client_id=c.id AND s.status='CONFIRMADA'
    GROUP BY c.id
    ORDER BY total_spent DESC`)).rows;

  const now = Date.now();
  const list = rows.map((r) => {
    const n_orders = Number(r.n_orders);
    const recency_days = r.last_order ? Math.floor((now - new Date(r.last_order).getTime()) / 86400000) : null;
    const first_days = r.first_order ? Math.floor((now - new Date(r.first_order).getTime()) / 86400000) : null;
    const seg = n_orders === 0 ? 'sin_compras' : segmentOf({ n_orders, recency_days, first_days });
    return {
      id: r.id, name: r.name, phone: r.phone,
      n_orders, total_spent: round0(Number(r.total_spent)),
      aov: n_orders ? round0(Number(r.total_spent) / n_orders) : 0,
      last_order: r.last_order, recency_days, segment: seg,
    };
  });
  const filtered = segment ? list.filter((c) => c.segment === segment) : list;
  const counts = {};
  for (const c of list) counts[c.segment] = (counts[c.segment] || 0) + 1;
  return { counts, customers: filtered };
}

/** Reportes comerciales: top productos, mix de segmentos, recurrencia. */
export async function reports({ from, to }) {
  const db = getDb();
  const f = from || new Date(Date.now() - 30 * 86400000).toISOString();
  const t = to || new Date().toISOString();
  const top = (await db.execute({
    sql: `SELECT p.name, SUM(si.qty) u, COALESCE(SUM(si.line_total),0) total
          FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.status='CONFIRMADA' AND s.sold_at>=? AND s.sold_at<=?
          JOIN products p ON p.id=si.product_id GROUP BY p.id ORDER BY total DESC LIMIT 10`,
    args: [f, t],
  })).rows.map((r) => ({ name: r.name, unidades: Number(r.u), total: round0(Number(r.total)) }));

  const { counts } = await customers();
  const totalCli = Object.values(counts).reduce((a, b) => a + b, 0);
  return { period: { from: f, to: t }, top_products: top, segment_mix: counts, total_clientes: totalCli };
}

// --- Campañas ---
export async function listCampaigns() {
  return (await getDb().execute(`SELECT * FROM campaigns ORDER BY created_at DESC`)).rows;
}
export async function createCampaign(c, userId) {
  const db = getDb();
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO campaigns (id,name,description,channel,segment,discount_type,discount_value,status,starts_at,ends_at,created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    args: [id, c.name, c.description || null, c.channel || 'WHATSAPP', c.segment || 'todos',
           c.discount_type || 'NINGUNO', Number(c.discount_value) || 0, c.status || 'borrador',
           c.starts_at || null, c.ends_at || null, userId || null],
  });
  return (await db.execute({ sql: `SELECT * FROM campaigns WHERE id=?`, args: [id] })).rows[0];
}
export async function updateCampaign(id, fields) {
  const db = getDb();
  const allowed = ['name', 'description', 'channel', 'segment', 'discount_type', 'discount_value', 'status', 'starts_at', 'ends_at'];
  const sets = [], args = [];
  for (const k of allowed) if (k in fields) { sets.push(`${k}=?`); args.push(fields[k]); }
  if (!sets.length) return null;
  sets.push(`updated_at=datetime('now')`); args.push(id);
  await db.execute({ sql: `UPDATE campaigns SET ${sets.join(', ')} WHERE id=?`, args });
  return (await db.execute({ sql: `SELECT * FROM campaigns WHERE id=?`, args: [id] })).rows[0];
}

// --- Loyalty básico ---
export async function loyaltyOverview() {
  const db = getDb();
  const rows = (await db.execute(`
    SELECT la.client_id, c.name, c.phone, la.points, la.tier
    FROM loyalty_accounts la JOIN clients c ON c.id=la.client_id
    ORDER BY la.points DESC LIMIT 100`)).rows;
  const totals = (await db.execute(`SELECT COUNT(*) n, COALESCE(SUM(points),0) pts FROM loyalty_accounts`)).rows[0];
  return { miembros: Number(totals.n), puntos_totales: Number(totals.pts), cuentas: rows };
}
// --- Cashback de fidelización (1 punto = $1 CLP; % configurable) ---
const DEFAULT_CASHBACK_PCT = 5;
const TIER_PLATA = 15000;  // CLP de cashback acumulado (≈ $300k gastados al 5%)
const TIER_ORO = 50000;    // (≈ $1.000.000 gastados al 5%)

async function cashbackPct(db) {
  try {
    const r = (await db.execute(`SELECT loyalty_cashback_pct FROM business_settings WHERE id=1`)).rows[0];
    const p = Number(r?.loyalty_cashback_pct);
    return Number.isFinite(p) && p >= 0 && p <= 100 ? p : DEFAULT_CASHBACK_PCT;
  } catch { return DEFAULT_CASHBACK_PCT; }
}

// Tier por acumulado histórico (SUM de EARN), NO por saldo: no baja al canjear.
async function tierFor(db, clientId) {
  const r = (await db.execute({
    sql: `SELECT COALESCE(SUM(points),0) e FROM loyalty_transactions WHERE client_id=? AND type='EARN'`,
    args: [clientId],
  })).rows[0];
  const lifetime = Number(r?.e || 0);
  return lifetime >= TIER_ORO ? 'ORO' : lifetime >= TIER_PLATA ? 'PLATA' : 'BRONCE';
}

const firstName = (n) => String(n || 'Cliente').trim().split(/\s+/)[0];

/**
 * Devengo de cashback al confirmar una venta con cliente.
 * Idempotente por venta (no duplica si la venta se sincroniza dos veces).
 * NO debe lanzar: se invoca como efecto secundario no-crítico de la venta.
 */
export async function accrueForSale({ clientId, saleId, total }) {
  if (!clientId || !(Number(total) > 0)) return null;
  const db = getDb();
  const ya = (await db.execute({ sql: `SELECT id FROM loyalty_transactions WHERE sale_id=? AND type='EARN'`, args: [saleId] })).rows[0];
  if (ya) return null; // ya devengado para esta venta
  const pct = await cashbackPct(db);
  const pts = Math.round(Number(total) * pct / 100);
  if (pts <= 0) return null;
  await db.execute({
    sql: `INSERT INTO loyalty_accounts (client_id, points) VALUES (?, ?)
          ON CONFLICT(client_id) DO UPDATE SET points = loyalty_accounts.points + ?, updated_at=datetime('now')`,
    args: [clientId, pts, pts],
  });
  await db.execute({
    sql: `INSERT INTO loyalty_transactions (id, client_id, type, points, sale_id, reason) VALUES (?,?, 'EARN', ?, ?, ?)`,
    args: [randomUUID(), clientId, pts, saleId, `Cashback ${pct}%`],
  });
  const tier = await tierFor(db, clientId);
  await db.execute({ sql: `UPDATE loyalty_accounts SET tier=? WHERE client_id=?`, args: [tier, clientId] });
  const acc = (await db.execute({ sql: `SELECT points FROM loyalty_accounts WHERE client_id=?`, args: [clientId] })).rows[0];
  return { client_id: clientId, earned: pts, points: Number(acc.points), tier };
}

/**
 * Billetera PÚBLICA por teléfono (match por últimos 8 dígitos).
 * Expone solo primer nombre + saldo + tier + últimos movimientos (privacidad).
 */
export async function walletByPhone(phone) {
  const db = getDb();
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 8) { const e = new Error('TELEFONO_INVALIDO'); e.status = 400; throw e; }
  const pct = await cashbackPct(db);
  const c = (await db.execute({
    sql: `SELECT c.id, c.name, COALESCE(la.points,0) points, COALESCE(la.tier,'BRONCE') tier
          FROM clients c LEFT JOIN loyalty_accounts la ON la.client_id=c.id
          WHERE REPLACE(REPLACE(c.phone,'+',''),' ','') LIKE ? LIMIT 1`,
    args: [`%${digits.slice(-8)}`],
  })).rows[0];
  if (!c) return { found: false, points: 0, tier: 'BRONCE', cashback_pct: pct };
  const tx = (await db.execute({
    sql: `SELECT type, points, reason, created_at FROM loyalty_transactions WHERE client_id=? ORDER BY created_at DESC LIMIT 10`,
    args: [c.id],
  })).rows;
  return {
    found: true, name: firstName(c.name), points: Number(c.points), tier: c.tier, cashback_pct: pct,
    movements: tx.map((t) => ({ type: t.type, points: Number(t.points), reason: t.reason, at: t.created_at })),
  };
}
export async function loyaltyMove({ clientId, type, points, reason, userId }) {
  const db = getDb();
  const cli = (await db.execute({ sql: `SELECT id FROM clients WHERE id=?`, args: [clientId] })).rows[0];
  if (!cli) return null;
  const delta = type === 'REDEEM' ? -Math.abs(points) : Math.abs(points);
  await db.execute({
    sql: `INSERT INTO loyalty_accounts (client_id, points) VALUES (?, ?)
          ON CONFLICT(client_id) DO UPDATE SET points = MAX(0, loyalty_accounts.points + ?), updated_at=datetime('now')`,
    args: [clientId, Math.max(0, delta), delta],
  });
  await db.execute({
    sql: `INSERT INTO loyalty_transactions (id, client_id, type, points, reason, created_by) VALUES (?,?,?,?,?,?)`,
    args: [randomUUID(), clientId, type, delta, reason || null, userId || null],
  });
  const acc = (await db.execute({ sql: `SELECT points FROM loyalty_accounts WHERE client_id=?`, args: [clientId] })).rows[0];
  const tier = await tierFor(db, clientId);
  await db.execute({ sql: `UPDATE loyalty_accounts SET tier=? WHERE client_id=?`, args: [tier, clientId] });
  return { client_id: clientId, points: Number(acc.points), tier };
}
