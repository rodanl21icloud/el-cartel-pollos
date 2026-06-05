// Controllers del módulo Finanzas/Costos. Toda la lógica vive en el service;
// aquí solo se arma el rango, los supuestos y la respuesta. (reports.view)
import { productCosts, deviations } from '../services/finance/costEngineering.js';

const range = (q) => ({
  from: q.from || new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
  to: q.to || new Date().toISOString(),
});
const meta = (from, to, extra = {}) => ({
  generated_at: new Date().toISOString(),
  period: { from, to },
  assumptions: [
    'Costo unitario = receta (BOM) × costo de insumo actual, ajustado por rendimiento y merma.',
    'Costo del período = promedio del costo congelado en los descuentos por venta.',
    'Insumo sin datos del período usa el costo actual como referencia.',
  ],
  disclaimer: 'Estimación operativa para gestión; no reemplaza la contabilidad de costos.',
  ...extra,
});

/** GET /api/finance/costs/summary?from=&to=&category= */
export async function costsSummary(req, res) {
  const { from, to } = range(req.query);
  const products = await productCosts({ from, to, category: req.query.category });
  res.json({ ...meta(from, to), products });
}

/** GET /api/finance/costs/deviations?from=&to=&threshold=3 */
export async function costDeviations(req, res) {
  const { from, to } = range(req.query);
  const threshold = Number(req.query.threshold) || 3;
  const alerts = await deviations({ from, to, threshold });
  res.json({ ...meta(from, to), threshold, alerts });
}

/** GET /api/finance/costs/product/:id?from=&to= */
export async function productCost(req, res) {
  const { from, to } = range(req.query);
  const product = (await productCosts({ from, to })).find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'PRODUCTO_NO_ENCONTRADO' });
  res.json({ ...meta(from, to), product });
}
