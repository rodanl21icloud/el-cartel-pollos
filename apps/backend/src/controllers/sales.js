// Controlador de ventas. El payload ya viene verificado por HMAC (req.verifiedPayload).
import crypto from 'node:crypto';
import { registerSale } from '../services/sales.js';
import { canonicalize } from '../middleware/hmac.js';

export async function syncSale(req, res) {
  const payload = req.verifiedPayload;
  // Recalcula el hash canónico para persistirlo como huella de la venta.
  const payloadHash = crypto.createHash('sha256').update(canonicalize(payload)).digest('hex');

  try {
    const result = await registerSale(payload, {
      userId: req.user.id,
      payloadHash,
      syncedOffline: !!payload._offline,
      ip: req.ip,
    });
    const code = result.status === 'DUPLICATE' ? 200 : 201;
    return res.status(code).json({
      status: result.status,
      sale_id: result.saleId,
      client_uuid: payload.client_uuid,
      total: result.total,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message, detail: err.detail });
  }
}

// Catálogo para la pantalla POS (productos activos).
export async function listProducts(req, res) {
  const { getDb } = await import('../db.js');
  const { rows } = await getDb().execute({
    sql: `SELECT id, sku, name, price, category FROM products WHERE is_active = 1 ORDER BY name`,
    args: [],
  });
  return res.json(rows);
}
