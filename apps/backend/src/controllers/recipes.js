// ============================================================
// Recetas (BOM) por producto. qty_per_unit admite enteros y decimales
// (ej. 0,5 pollo; 0,6 kg papas). El descuento de inventario al vender
// multiplica esta cantidad por las unidades vendidas.
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { writeAudit } from '../services/audit.js';

/** GET /api/products/:id/recipe — líneas de receta con info del insumo y costo estimado. */
export async function getRecipe(req, res) {
  const { id } = req.params;
  const db = getDb();
  const prod = await db.execute({ sql: `SELECT id, name, price FROM products WHERE id = ?`, args: [id] });
  if (!prod.rows.length) return res.status(404).json({ error: 'PRODUCTO_NO_ENCONTRADO' });

  const { rows } = await db.execute({
    sql: `SELECT pr.ingredient_id, pr.qty_per_unit, i.name AS ingredient, i.unit, i.cost_unit
          FROM product_recipes pr JOIN ingredients i ON i.id = pr.ingredient_id
          WHERE pr.product_id = ? ORDER BY i.name`,
    args: [id],
  });
  const lines = rows.map((r) => ({
    ingredient_id: r.ingredient_id, ingredient: r.ingredient, unit: r.unit,
    qty_per_unit: Number(r.qty_per_unit), cost_unit: Number(r.cost_unit),
    line_cost: Number(r.qty_per_unit) * Number(r.cost_unit),
  }));
  const costo_total = lines.reduce((s, l) => s + l.line_cost, 0);
  return res.json({
    product_id: id, name: prod.rows[0].name, price: Number(prod.rows[0].price),
    lines, costo_insumos: Math.round((costo_total + Number.EPSILON) * 100) / 100,
  });
}

/**
 * PUT /api/products/:id/recipe  Body: { lines: [{ ingredient_id, qty_per_unit }] }
 * Reemplaza la receta completa (replace-all) en una transacción.
 */
export async function setRecipe(req, res) {
  const { id } = req.params;
  const { lines } = req.body || {};
  if (!Array.isArray(lines)) return res.status(400).json({ error: 'LINEAS_INVALIDAS' });

  const db = getDb();
  const prod = await db.execute({ sql: `SELECT id FROM products WHERE id = ?`, args: [id] });
  if (!prod.rows.length) return res.status(404).json({ error: 'PRODUCTO_NO_ENCONTRADO' });

  // Validar líneas: insumo existe, qty > 0 (acepta decimales), sin duplicados.
  const seen = new Set();
  for (const l of lines) {
    if (!l.ingredient_id) return res.status(400).json({ error: 'INSUMO_REQUERIDO' });
    const qty = Number(l.qty_per_unit);
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'CANTIDAD_INVALIDA', detail: l.ingredient_id });
    if (seen.has(l.ingredient_id)) return res.status(400).json({ error: 'INSUMO_DUPLICADO', detail: l.ingredient_id });
    seen.add(l.ingredient_id);
  }
  if (lines.length) {
    const ph = lines.map(() => '?').join(',');
    const found = await db.execute({
      sql: `SELECT id FROM ingredients WHERE is_active = 1 AND id IN (${ph})`,
      args: lines.map((l) => l.ingredient_id),
    });
    if (found.rows.length !== lines.length) return res.status(409).json({ error: 'INSUMO_NO_ENCONTRADO' });
  }

  const stmts = [{ sql: `DELETE FROM product_recipes WHERE product_id = ?`, args: [id] }];
  for (const l of lines) {
    stmts.push({
      sql: `INSERT INTO product_recipes (id, product_id, ingredient_id, qty_per_unit) VALUES (?,?,?,?)`,
      args: [randomUUID(), id, l.ingredient_id, Number(l.qty_per_unit)],
    });
  }
  await db.batch(stmts, 'write');
  await writeAudit({ userId: req.user.id, action: 'RECIPE_UPDATE', entity: 'product_recipes', entityId: id,
    severity: 'INFO', ip: req.ip, metadata: { lineas: lines.length } });

  return res.json({ product_id: id, lines: lines.length });
}
