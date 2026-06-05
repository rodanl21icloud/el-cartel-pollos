// Controllers de Auditoría de Gastos. Lógica en el service expenseAudit.
import { auditExpenses, reviewExpense } from '../services/finance/expenseAudit.js';
import { writeAudit } from '../services/audit.js';

const DISCLAIMER = 'Clasificación de riesgo para revisión interna; no constituye criterio final del SII.';

/** GET /api/finance/expenses/audit?from=&to=&risk=alto|medio|bajo  (reports.view) */
export async function expensesAudit(req, res) {
  const { from, to, risk } = req.query;
  const data = await auditExpenses({ from, to, risk });
  res.json({ generated_at: new Date().toISOString(), period: { from: from || null, to: to || null }, disclaimer: DISCLAIMER, ...data });
}

/** POST /api/finance/expenses/:id/audit  Body: { meta?, status?, notes? }  (expenses.manage) */
export async function expenseAuditReview(req, res) {
  const { meta, status, notes } = req.body || {};
  const VALID = new Set(['pendiente', 'revisado', 'confirmado', 'observacion']);
  if (status && !VALID.has(status)) return res.status(400).json({ error: 'ESTADO_INVALIDO' });

  const item = await reviewExpense(req.params.id, { meta, status, notes, reviewedBy: req.user.id });
  if (!item) return res.status(404).json({ error: 'GASTO_NO_ENCONTRADO' });

  await writeAudit({
    userId: req.user.id, action: 'EXPENSE_AUDIT_REVIEW', entity: 'expenses', entityId: req.params.id,
    severity: 'INFO', ip: req.ip, metadata: { status: item.review_status, risk: item.risk },
  });
  res.json({ item, disclaimer: DISCLAIMER });
}
