// ============================================================
// Ingeniería de Costos (Módulo Finanzas, Fase 1).
// Reutiliza el BOM (product_recipes), insumos (ingredients) y los costos
// CONGELADOS de venta (inventory_adjustments type='VENTA'.unit_cost).
// No duplica lógica de P&L: solo expone costo/margen/food-cost/desviación.
//
// Definiciones (auditable):
//  - unit_cost        = costo unitario ESTÁNDAR HOY = Σ receta × costo_insumo_actual,
//                       ajustado por rendimiento (yield_pct) y merma (waste_pct).
//  - unit_cost_period = costo unitario al que SE VENDIÓ en el período (promedio
//                       de unit_cost congelado en los descuentos por BOM).
//  - cost_trend_pct   = (unit_cost - unit_cost_period) / unit_cost_period × 100
//                       (positivo = el costo SUBIÓ respecto al período → proveedor/merma).
// ============================================================
import { getDb } from '../../db.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Factor de ajuste por rendimiento/merma, idéntico para costo actual y de período
// (se cancela en el % de desviación; afecta el monto absoluto del costo).
const ADJ = `(1 + COALESCE(i.waste_pct,0)/100.0) / (COALESCE(pr.yield_pct,100)/100.0)`;

/**
 * Costos por producto en un rango. Si no hay rango usa el día en curso.
 * @returns array de productos con costo, margen, food cost y tendencia de costo.
 */
export async function productCosts({ from, to, category } = {}) {
  const db = getDb();
  const f = from || new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const t = to || new Date().toISOString();

  const sql = `
    SELECT p.id, p.name, p.category, p.price,
      -- costo estándar actual
      COALESCE((SELECT SUM(pr.qty_per_unit * i.cost_unit * ${ADJ})
                FROM product_recipes pr JOIN ingredients i ON i.id = pr.ingredient_id
                WHERE pr.product_id = p.id), 0) AS unit_cost,
      -- nº de líneas de receta (para saber si tiene costo cargado)
      (SELECT COUNT(*) FROM product_recipes pr WHERE pr.product_id = p.id) AS recipe_lines,
      -- costo al que se vendió en el período (frozen avg por insumo; fallback al actual)
      (SELECT SUM(pr.qty_per_unit * COALESCE(af.c, i.cost_unit) * ${ADJ})
         FROM product_recipes pr JOIN ingredients i ON i.id = pr.ingredient_id
         LEFT JOIN (SELECT ingredient_id, AVG(unit_cost) c FROM inventory_adjustments
                    WHERE type='VENTA' AND datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)
                    GROUP BY ingredient_id) af ON af.ingredient_id = pr.ingredient_id
         WHERE pr.product_id = p.id) AS unit_cost_period,
      -- unidades vendidas en el período
      COALESCE((SELECT SUM(si.qty) FROM sale_items si JOIN sales s ON s.id = si.sale_id
                WHERE s.status='CONFIRMADA' AND si.product_id = p.id
                  AND s.sold_at >= ? AND s.sold_at <= ?), 0) AS units
    FROM products p
    WHERE p.is_active = 1 ${category ? 'AND p.category = ?' : ''}
    ORDER BY p.category, p.name`;
  const args = category ? [f, t, f, t, category] : [f, t, f, t];
  const rows = (await db.execute({ sql, args })).rows;

  return rows.map((r) => {
    const price = Number(r.price);
    const unit_cost = round2(Number(r.unit_cost));
    const units = Number(r.units);
    const periodCost = r.unit_cost_period == null ? null : round2(Number(r.unit_cost_period));
    const margin = round2(price - unit_cost);
    const trend = units > 0 && periodCost && periodCost > 0
      ? round2((unit_cost - periodCost) / periodCost * 100) : null;
    return {
      id: r.id, name: r.name, category: r.category, price,
      unit_cost, unit_cost_period: periodCost, units,
      gross_margin: margin,
      gross_margin_pct: price > 0 ? round2(margin / price * 100) : null,
      food_cost_pct: price > 0 ? round2(unit_cost / price * 100) : null,
      cost_trend_pct: trend,
      cost_loaded: Number(r.recipe_lines) > 0,
    };
  });
}

/** Alertas: productos cuya desviación de costo supera el umbral (default 3%). */
export async function deviations({ from, to, threshold = 3 } = {}) {
  const list = await productCosts({ from, to });
  return list
    .filter((p) => p.cost_trend_pct != null && Math.abs(p.cost_trend_pct) > threshold)
    .map((p) => ({
      product_id: p.id, name: p.name, category: p.category,
      kind: p.cost_trend_pct > 0 ? 'COSTO_AL_ALZA' : 'COSTO_A_LA_BAJA',
      expected: p.unit_cost_period, actual: p.unit_cost,
      deviation_pct: p.cost_trend_pct, threshold_pct: threshold,
      cause: p.cost_trend_pct > 0 ? 'Posible alza de proveedor o mayor merma' : 'Costo de insumo bajó',
    }))
    .sort((a, b) => Math.abs(b.deviation_pct) - Math.abs(a.deviation_pct));
}
