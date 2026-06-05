// ============================================================
// Auditoría de Gastos (Módulo Finanzas, Fase 2).
// Clasifica cada gasto en un nivel de riesgo tributario (alto/medio/bajo)
// según un motor de reglas CONFIGURABLE (umbrales en tax_config).
// NO es dictamen del SII: es una señal de riesgo para revisión.
// ============================================================
import { getDb } from '../../db.js';

// --- Validación de RUT chileno (formato + dígito verificador) ---
export function rutValido(rut) {
  if (!rut) return false;
  const limpio = String(rut).replace(/[.\s]/g, '').toUpperCase();
  const m = /^(\d{7,8})-([\dK])$/.exec(limpio);
  if (!m) return false;
  let suma = 0, mul = 2;
  for (let i = m[1].length - 1; i >= 0; i--) { suma += Number(m[1][i]) * mul; mul = mul === 7 ? 2 : mul + 1; }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === m[2];
}
const normRut = (r) => (r ? String(r).replace(/[.\s]/g, '').toUpperCase() : null);

async function getConfig(db) {
  const rows = (await db.execute(`SELECT key, value FROM tax_config`)).rows;
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const company = (await db.execute(`SELECT rut FROM business_settings WHERE id = 1`)).rows[0];
  return {
    noDocThreshold: Number(cfg.audit_no_doc_threshold || 50000),
    companyRut: normRut(company?.rut),
  };
}

// Devuelve { risk: 'alto'|'medio'|'bajo'|'retiro', reason }.
function classify(e, cfg) {
  if (e.kind === 'RETIRO') return { risk: 'retiro', reason: 'Retiro de utilidades: no es gasto deducible.' };

  const docType = (e.doc_type || '').toUpperCase();
  const sinDoc = (!docType || docType === 'NINGUNO') && !e.document_ref;
  if (sinDoc) {
    return e.amount >= cfg.noDocThreshold
      ? { risk: 'alto', reason: `Sin documento de respaldo sobre $${cfg.noDocThreshold.toLocaleString('es-CL')}.` }
      : { risk: 'medio', reason: 'Sin documento de respaldo.' };
  }
  if (e.company_rut && cfg.companyRut && normRut(e.company_rut) !== cfg.companyRut) {
    return { risk: 'alto', reason: 'Documento emitido a un RUT distinto al de la empresa (no da crédito).' };
  }
  if (e.giro_relation === 'dudoso') return { risk: 'alto', reason: 'Relación con el giro marcada como dudosa.' };
  if (e.supplier_rut && !rutValido(e.supplier_rut)) return { risk: 'medio', reason: 'RUT del proveedor con formato/DV inválido.' };
  if (docType === 'FACTURA' && !e.gives_credit) return { risk: 'medio', reason: 'Factura sin crédito fiscal marcado: revisar.' };
  if (e.giro_relation === 'indirecto') return { risk: 'medio', reason: 'Gasto indirecto al giro: revisar deducibilidad.' };
  return { risk: 'bajo', reason: 'Documentado y coherente con el giro.' };
}

const ORDER = { alto: 0, medio: 1, bajo: 2, retiro: 3 };

/** Lista de gastos clasificados + resumen. (from/to ISO; risk opcional) */
export async function auditExpenses({ from, to, risk } = {}) {
  const db = getDb();
  const cfg = await getConfig(db);
  const clauses = [], args = [];
  if (from) { clauses.push('e.spent_at >= ?'); args.push(from); }
  if (to) { clauses.push('e.spent_at <= ?'); args.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = (await db.execute({
    sql: `SELECT e.id, e.amount, e.supplier, e.description, e.document_ref, e.spent_at, e.payment_method,
                 c.name AS category, c.kind,
                 m.supplier_rut, m.company_rut, m.doc_type, m.doc_number, m.gives_credit, m.tax_category, m.giro_relation,
                 r.status AS review_status, r.notes AS review_notes, r.reviewed_at
          FROM expenses e
          JOIN expense_categories c ON c.id = e.category_id
          LEFT JOIN expense_tax_metadata m ON m.expense_id = e.id
          LEFT JOIN expense_audit_reviews r ON r.expense_id = e.id
          ${where} ORDER BY e.spent_at DESC LIMIT 500`,
    args,
  })).rows;

  let items = rows.map((e) => {
    const { risk: rk, reason } = classify({ ...e, amount: Number(e.amount), gives_credit: Number(e.gives_credit || 0) }, cfg);
    return {
      id: e.id, amount: Number(e.amount), supplier: e.supplier, description: e.description,
      document_ref: e.document_ref, spent_at: e.spent_at, payment_method: e.payment_method,
      category: e.category, kind: e.kind,
      meta: {
        supplier_rut: e.supplier_rut || null, company_rut: e.company_rut || null,
        doc_type: e.doc_type || null, doc_number: e.doc_number || null,
        gives_credit: Number(e.gives_credit || 0), tax_category: e.tax_category || null,
        giro_relation: e.giro_relation || 'directo',
      },
      risk: rk, reason,
      review_status: e.review_status || 'pendiente',
      review_notes: e.review_notes || null,
    };
  });
  if (risk) items = items.filter((i) => i.risk === risk);
  items.sort((a, b) => ORDER[a.risk] - ORDER[b.risk] || b.amount - a.amount);

  const summary = { total: items.length, alto: 0, medio: 0, bajo: 0, retiro: 0, monto_riesgo: 0 };
  for (const i of items) { summary[i.risk]++; if (i.risk === 'alto' || i.risk === 'medio') summary.monto_riesgo += i.amount; }
  summary.monto_riesgo = Math.round(summary.monto_riesgo);

  return { config: { no_doc_threshold: cfg.noDocThreshold, company_rut: cfg.companyRut }, summary, items };
}

/** Upsert metadata tributaria + estado de revisión de un gasto; devuelve el ítem reclasificado. */
export async function reviewExpense(expenseId, { meta, status, notes, reviewedBy } = {}) {
  const db = getDb();
  const exists = (await db.execute({ sql: `SELECT id, spent_at FROM expenses WHERE id = ?`, args: [expenseId] })).rows[0];
  if (!exists) return null;

  if (meta) {
    await db.execute({
      sql: `INSERT INTO expense_tax_metadata (expense_id, supplier_rut, company_rut, doc_type, doc_number, gives_credit, tax_category, giro_relation, updated_at)
            VALUES (?,?,?,?,?,?,?,?, datetime('now'))
            ON CONFLICT(expense_id) DO UPDATE SET
              supplier_rut=excluded.supplier_rut, company_rut=excluded.company_rut, doc_type=excluded.doc_type,
              doc_number=excluded.doc_number, gives_credit=excluded.gives_credit, tax_category=excluded.tax_category,
              giro_relation=excluded.giro_relation, updated_at=datetime('now')`,
      args: [expenseId, meta.supplier_rut || null, meta.company_rut || null, meta.doc_type || null,
             meta.doc_number || null, meta.gives_credit ? 1 : 0, meta.tax_category || null, meta.giro_relation || 'directo'],
    });
  }
  if (status || notes != null) {
    await db.execute({
      sql: `INSERT INTO expense_audit_reviews (expense_id, status, notes, reviewed_by, reviewed_at)
            VALUES (?,?,?,?, datetime('now'))
            ON CONFLICT(expense_id) DO UPDATE SET
              status=COALESCE(excluded.status, expense_audit_reviews.status),
              notes=excluded.notes, reviewed_by=excluded.reviewed_by, reviewed_at=datetime('now')`,
      args: [expenseId, status || 'revisado', notes || null, reviewedBy || null],
    });
  }
  // Reclasifica este gasto puntual reutilizando auditExpenses con su propia fecha.
  const { items } = await auditExpenses({ from: exists.spent_at, to: exists.spent_at });
  return items.find((i) => i.id === expenseId) || null;
}
