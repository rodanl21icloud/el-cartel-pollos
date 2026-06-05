// ============================================================
// Tax Forecaster (Módulo Finanzas, Fase 3).
// Proyecta la carga tributaria mensual (IVA débito/crédito/neto + PPM) leyendo
// ventas y gastos reales. TODO parámetro vive en tax_config (no hardcode).
// Marca explícita: es ESTIMACIÓN, no reemplaza revisión contable.
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db.js';

const round0 = (n) => Math.round(n || 0);

// Bordes del mes 'YYYY-MM' en hora local (mes de negocio).
function monthBounds(period) {
  const [y, m] = String(period).split('-').map(Number);
  const from = new Date(y, m - 1, 1, 0, 0, 0, 0).toISOString();
  const to = new Date(y, m, 0, 23, 59, 59, 999).toISOString();
  return { from, to };
}

export async function getTaxConfig() {
  const db = getDb();
  const rows = (await db.execute(`SELECT key, value FROM tax_config`)).rows;
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    iva_rate: Number(cfg.iva_rate ?? 0.19),
    ppm_rate: Number(cfg.ppm_rate ?? 0),
    regime: cfg.regime || 'PRO_PYME',
  };
}

// IVA contenido en un monto bruto (precio con IVA incluido).
const ivaDe = (bruto, rate) => bruto * rate / (1 + rate);
const netoDe = (bruto, rate) => bruto / (1 + rate);

/** Proyección tributaria del período (YYYY-MM). */
export async function forecast(period) {
  const db = getDb();
  const cfg = await getTaxConfig();
  const { from, to } = monthBounds(period);

  // Ventas afectas (precio con IVA incluido).
  const ventasBrutas = Number((await db.execute({
    sql: `SELECT COALESCE(SUM(total),0) t FROM sales WHERE status='CONFIRMADA' AND sold_at>=? AND sold_at<=?`,
    args: [from, to],
  })).rows[0].t);

  // Crédito IVA: confirmado (gives_credit=1) y potencial (con cualquier documento).
  const exp = (await db.execute({
    sql: `SELECT COALESCE(SUM(CASE WHEN m.gives_credit=1 THEN e.amount ELSE 0 END),0) conf,
                 COALESCE(SUM(CASE WHEN m.gives_credit=1 OR e.document_ref IS NOT NULL OR m.doc_type IN ('FACTURA','BOLETA') THEN e.amount ELSE 0 END),0) pot,
                 COALESCE(SUM(e.amount),0) total
          FROM expenses e
          JOIN expense_categories c ON c.id=e.category_id AND c.kind='OPERATIVO'
          LEFT JOIN expense_tax_metadata m ON m.expense_id=e.id
          WHERE e.spent_at>=? AND e.spent_at<=?`,
    args: [from, to],
  })).rows[0];

  const r = cfg.iva_rate;
  const iva_debito = round0(ivaDe(ventasBrutas, r));
  const iva_credito = round0(ivaDe(Number(exp.conf), r));
  const iva_credito_potencial = round0(ivaDe(Number(exp.pot), r));
  const ventas_netas = round0(netoDe(ventasBrutas, r));
  const iva_neto = iva_debito - iva_credito;
  const ppm = round0(ventas_netas * cfg.ppm_rate);

  return {
    period, generated_at: new Date().toISOString(), cutoff: { from, to },
    config: cfg,
    ventas_brutas: round0(ventasBrutas), ventas_netas,
    iva_debito, iva_credito, iva_credito_potencial, iva_neto,
    ppm,
    a_pagar_estimado: Math.max(0, iva_neto) + ppm,
    gastos_sin_credito: round0(Number(exp.total) - Number(exp.pot)),
    assumptions: [
      'Ventas con IVA incluido; débito = total × tasa/(1+tasa).',
      'Crédito IVA confirmado = gastos OPERATIVOS marcados con derecho a crédito.',
      'Crédito potencial = gastos con cualquier documento (completar metadata en Auditoría para confirmarlo).',
      `PPM = ventas netas × ${cfg.ppm_rate} (parámetro tax_config.ppm_rate).`,
    ],
    disclaimer: 'Estimación de gestión. No reemplaza la declaración ni la revisión de tu contador.',
  };
}

/** Aplica entradas hipotéticas sobre el forecast base y devuelve antes/después. */
function applyEntries(base, entries, rate) {
  let dDeb = 0, dCred = 0;
  for (const e of entries) {
    const net = Number(e.net_amount) || 0;
    const iva = e.iva != null ? Number(e.iva) : net * rate; // si no se especifica, IVA = neto×tasa
    if (e.treatment === 'venta' || e.type === 'VENTA') dDeb += iva;          // más venta => más débito
    else dCred += iva;                                                        // compra/inversión => más crédito
  }
  const iva_debito = base.iva_debito + round0(dDeb);
  const iva_credito = base.iva_credito + round0(dCred);
  const iva_neto = iva_debito - iva_credito;
  const a_pagar_estimado = Math.max(0, iva_neto) + base.ppm;
  return { iva_debito, iva_credito, iva_neto, ppm: base.ppm, a_pagar_estimado };
}

/** Guarda un escenario (congela el forecast base) y devuelve su impacto. */
export async function saveSimulation({ name, period, entries = [], createdBy }) {
  const db = getDb();
  const base = await forecast(period);
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO tax_simulation_scenarios (id, name, period, base_json, created_by) VALUES (?,?,?,?,?)`,
    args: [id, name || `Escenario ${period}`, period, JSON.stringify(base), createdBy || null],
  });
  for (const e of entries) {
    await db.execute({
      sql: `INSERT INTO tax_simulation_entries (id, scenario_id, type, description, net_amount, iva, treatment) VALUES (?,?,?,?,?,?,?)`,
      args: [randomUUID(), id, e.type || 'COMPRA', e.description || null,
             Number(e.net_amount) || 0, e.iva != null ? Number(e.iva) : (Number(e.net_amount) || 0) * base.config.iva_rate,
             e.treatment || 'gasto'],
    });
  }
  return getSimulation(id);
}

/** Lee un escenario y recalcula su impacto antes/después. */
export async function getSimulation(id) {
  const db = getDb();
  const sc = (await db.execute({ sql: `SELECT * FROM tax_simulation_scenarios WHERE id=?`, args: [id] })).rows[0];
  if (!sc) return null;
  const entries = (await db.execute({ sql: `SELECT type, description, net_amount, iva, treatment FROM tax_simulation_entries WHERE scenario_id=?`, args: [id] })).rows
    .map((e) => ({ type: e.type, description: e.description, net_amount: Number(e.net_amount), iva: Number(e.iva), treatment: e.treatment }));
  const base = JSON.parse(sc.base_json);
  const after = applyEntries(base, entries, base.config.iva_rate);
  return {
    id: sc.id, name: sc.name, period: sc.period, created_at: sc.created_at,
    entries,
    base: { iva_debito: base.iva_debito, iva_credito: base.iva_credito, iva_neto: base.iva_neto, ppm: base.ppm, a_pagar_estimado: base.a_pagar_estimado },
    after,
    delta: { a_pagar: after.a_pagar_estimado - base.a_pagar_estimado, iva_neto: after.iva_neto - base.iva_neto },
    disclaimer: base.disclaimer,
  };
}
