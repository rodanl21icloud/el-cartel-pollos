// ============================================================
// Gastos / egresos. Cualquier rol autenticado puede registrar un gasto
// (queda auditado). El listado y los totales se usan en reportes.
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

const METHODS = new Set(['EFECTIVO', 'POS', 'TRANSFERENCIA']);

/** GET /api/expenses/categories */
export async function listCategories(_req, res) {
  const db = getDb();
  const { rows } = await db.execute({
    sql: `SELECT id, name, kind FROM expense_categories WHERE is_active = 1 ORDER BY kind, name`,
    args: [],
  });
  return res.json(rows);
}

/** POST /api/expenses  Body: { category_id, amount, payment_method, description, supplier?, document_ref?, spent_at? } */
export async function createExpense(req, res) {
  const { category_id, amount, payment_method, description, supplier, document_ref, spent_at } = req.body || {};

  if (!category_id) return res.status(400).json({ error: 'CATEGORIA_REQUERIDA' });
  if (typeof amount !== 'number' || !(amount > 0)) return res.status(400).json({ error: 'MONTO_INVALIDO' });
  if (!METHODS.has(payment_method)) return res.status(400).json({ error: 'METODO_PAGO_INVALIDO' });
  if (!description || !String(description).trim()) return res.status(400).json({ error: 'DESCRIPCION_OBLIGATORIA' });

  const db = getDb();
  const cat = await db.execute({
    sql: `SELECT id, name FROM expense_categories WHERE id = ? AND is_active = 1`,
    args: [category_id],
  });
  if (!cat.rows.length) return res.status(404).json({ error: 'CATEGORIA_NO_ENCONTRADA' });

  const id = randomUUID();
  // spent_at en ISO 8601 (UTC) para ser comparable con los rangos de la
  // sesión de caja y los reportes (mismo formato que sales.sold_at).
  await db.execute({
    sql: `INSERT INTO expenses
            (id, category_id, user_id, amount, payment_method, supplier, description, document_ref, spent_at)
          VALUES (?,?,?,?,?,?,?,?,?)`,
    args: [id, category_id, req.user.id, amount, payment_method,
           supplier ? String(supplier).trim() : null, String(description).trim(),
           document_ref ? String(document_ref).trim() : null, spent_at || new Date().toISOString()],
  });
  await writeAudit({
    userId: req.user.id, action: 'EXPENSE_CREATE', entity: 'expenses', entityId: id,
    severity: 'INFO', ip: req.ip,
    metadata: { amount, payment_method, category: cat.rows[0].name },
  });

  return res.status(201).json({ expense_id: id, amount, category: cat.rows[0].name });
}

/** GET /api/expenses?from=&to=  — listado para gerencia. */
export async function listExpenses(req, res) {
  const { from, to } = req.query;
  const db = getDb();
  const clauses = [];
  const args = [];
  if (from) { clauses.push('e.spent_at >= ?'); args.push(from); }
  if (to) { clauses.push('e.spent_at <= ?'); args.push(to); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const { rows } = await db.execute({
    sql: `SELECT e.id, e.amount, e.payment_method, e.supplier, e.description,
                 e.document_ref, e.spent_at, c.name AS category, c.kind
          FROM expenses e JOIN expense_categories c ON c.id = e.category_id
          ${where} ORDER BY e.spent_at DESC LIMIT 200`,
    args,
  });
  return res.json(rows);
}
