// ============================================================
// Liquidez y Retiro de Utilidades (Módulo Finanzas, Fase 4).
// Combina caja actual (banco + caja chica), tendencia de ventas/egresos y los
// impuestos estimados (Tax Forecaster) para mostrar caja libre y excedente
// retirable sin matar la operación. CAJA ≠ utilidad contable.
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db.js';
import { forecast } from './taxForecast.js';

const round0 = (n) => Math.round(n || 0);
const LOOKBACK = 30; // días para promediar ventas/egresos

async function getPolicy(db) {
  const p = (await db.execute(`SELECT min_buffer, horizon_days, sales_basis FROM cash_policy_settings WHERE id=1`)).rows[0]
    || { min_buffer: 500000, horizon_days: 30, sales_basis: 'promedio' };
  return { min_buffer: Number(p.min_buffer), horizon_days: Number(p.horizon_days), sales_basis: p.sales_basis };
}

/** Resumen de liquidez con proyección 7/15/30 días. */
export async function liquiditySummary() {
  const db = getDb();
  const policy = await getPolicy(db);
  const now = new Date();
  const from = new Date(now.getTime() - LOOKBACK * 86400000).toISOString();
  const to = now.toISOString();

  // Caja actual = saldo bancario contable + caja chica del último cierre.
  const bs = (await db.execute(`SELECT bank_balance FROM business_settings WHERE id=1`)).rows[0];
  const lastClose = (await db.execute(`SELECT efectivo_teorico FROM cash_register_closures ORDER BY created_at DESC LIMIT 1`)).rows[0];
  const bank = Number(bs?.bank_balance || 0);
  const cajaChica = Number(lastClose?.efectivo_teorico || 0);
  const current_cash = round0(bank + cajaChica);

  // Promedios diarios (últimos 30 días).
  const ventas = Number((await db.execute({ sql: `SELECT COALESCE(SUM(total),0) t FROM sales WHERE status='CONFIRMADA' AND sold_at>=? AND sold_at<=?`, args: [from, to] })).rows[0].t);
  const egresos = Number((await db.execute({ sql: `SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE spent_at>=? AND spent_at<=?`, args: [from, to] })).rows[0].t);
  const daily_net = (ventas - egresos) / LOOKBACK;

  // Impuestos estimados del mes en curso (compromiso).
  const period = now.toISOString().slice(0, 7);
  const tax = await forecast(period);
  const committed_cash = round0(Math.max(0, tax.a_pagar_estimado));

  const project = (n) => round0(current_cash + daily_net * n);
  const projected_cash_7d = project(7), projected_cash_15d = project(15), projected_cash_30d = project(30);

  const operational_cash = round0(policy.min_buffer + committed_cash); // reservado: colchón + impuestos
  const free_cash = Math.max(0, round0(current_cash - operational_cash));
  const withdrawable_cash = Math.max(0, Math.min(free_cash, round0(projected_cash_30d - operational_cash)));

  return {
    generated_at: now.toISOString(),
    current_cash,
    projected_cash_7d, projected_cash_15d, projected_cash_30d,
    min_buffer: round0(policy.min_buffer),
    operational_cash, committed_cash, free_cash, withdrawable_cash,
    breakdown: { bank, caja_chica: round0(cajaChica), ventas_30d: round0(ventas), egresos_30d: round0(egresos), daily_net: round0(daily_net), impuestos_estimados: committed_cash },
    policy,
    assumptions: [
      'Caja actual = saldo bancario contable + efectivo del último cierre.',
      `Proyección = caja actual + flujo neto diario × días (promedio últimos ${LOOKBACK} días).`,
      'Compromisos = impuestos estimados del mes (Tax Forecaster).',
      'Reservado = colchón mínimo + compromisos. Caja libre = actual − reservado.',
      'Retirable = lo libre que se sostiene mirando 30 días.',
    ],
    disclaimer: 'Liquidez de caja (no es utilidad contable). El monto a retirar debe validarse con tu contador.',
  };
}

/** Aplica un escenario (retiro/compra/ingreso) sobre el resumen y devuelve antes/después. */
export async function applyScenario({ name, kind, delta_amount, createdBy, persist = true }) {
  const db = getDb();
  const base = await liquiditySummary();
  const signed = (kind === 'INGRESO' ? 1 : -1) * Math.abs(Number(delta_amount) || 0);

  const current = base.current_cash + signed;
  const p30 = base.projected_cash_30d + signed;
  const free_cash = Math.max(0, round0(current - base.operational_cash));
  const withdrawable_cash = Math.max(0, Math.min(free_cash, round0(p30 - base.operational_cash)));
  const after = {
    current_cash: round0(current),
    projected_cash_30d: round0(p30),
    free_cash, withdrawable_cash,
    salud: current < base.min_buffer ? 'BAJO_COLCHON' : free_cash > 0 ? 'OK' : 'AJUSTADO',
  };

  if (persist) {
    await db.execute({
      sql: `INSERT INTO liquidity_scenarios (id, name, kind, delta_amount, created_by) VALUES (?,?,?,?,?)`,
      args: [randomUUID(), name || `${kind} ${Math.abs(delta_amount)}`, kind, Math.abs(Number(delta_amount) || 0), createdBy || null],
    });
  }
  return {
    base: { current_cash: base.current_cash, projected_cash_30d: base.projected_cash_30d, free_cash: base.free_cash, withdrawable_cash: base.withdrawable_cash },
    after,
    delta: { free_cash: after.free_cash - base.free_cash, current_cash: signed },
    disclaimer: base.disclaimer,
  };
}

export async function setPolicy({ min_buffer, horizon_days, sales_basis }) {
  const db = getDb();
  const sets = [], args = [];
  if (min_buffer != null) { sets.push('min_buffer=?'); args.push(Number(min_buffer)); }
  if (horizon_days != null) { sets.push('horizon_days=?'); args.push(Number(horizon_days)); }
  if (sales_basis) { sets.push('sales_basis=?'); args.push(sales_basis); }
  if (!sets.length) return getPolicy(db);
  sets.push(`updated_at=datetime('now')`);
  await db.execute({ sql: `UPDATE cash_policy_settings SET ${sets.join(', ')} WHERE id=1`, args });
  return getPolicy(db);
}
