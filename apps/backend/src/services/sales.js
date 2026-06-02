// ============================================================
// Servicio de ventas: registro transaccional + descuento BOM.
// - Idempotente por client_uuid (reintentos offline seguros).
// - Atómico: venta + items + descuento de insumos + auditoría
//   ocurren en una sola transacción libSQL (batch).
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';

/**
 * registerSale — persiste una venta verificada (HMAC) y descuenta el BOM.
 * @param payload  objeto firmado: { client_uuid, items:[{product_id, qty}], payment_method, sold_at }
 * @param ctx      { userId, payloadHash, syncedOffline, ip }
 * @returns { status: 'CREATED'|'DUPLICATE', saleId, total }
 */
export async function registerSale(payload, ctx) {
  const db = getDb();
  const { client_uuid, items, payment_method, sold_at, free_amount, note, discount: rawDiscount } = payload;
  const isFree = free_amount != null;

  // Validación estructural mínima.
  if (!client_uuid) { const e = new Error('VENTA_INVALIDA'); e.status = 400; throw e; }
  if (!isFree && (!Array.isArray(items) || items.length === 0)) {
    const e = new Error('VENTA_INVALIDA'); e.status = 400; throw e;
  }
  if (isFree && (typeof free_amount !== 'number' || !(free_amount > 0))) {
    const e = new Error('MONTO_INVALIDO'); e.status = 400; throw e;
  }
  if (!['EFECTIVO', 'POS', 'TRANSFERENCIA'].includes(payment_method)) {
    const e = new Error('METODO_PAGO_INVALIDO'); e.status = 400; throw e;
  }

  // Idempotencia: si ya existe, no se reprocesa (clave para offline-sync).
  const exists = await db.execute({
    sql: `SELECT id, total, order_number FROM sales WHERE client_uuid = ?`,
    args: [client_uuid],
  });
  if (exists.rows.length) {
    return { status: 'DUPLICATE', saleId: exists.rows[0].id, total: Number(exists.rows[0].total),
             orderNumber: exists.rows[0].order_number != null ? Number(exists.rows[0].order_number) : null };
  }

  // --- Venta libre: ingreso sin productos ni BOM ---
  if (isFree) {
    const saleId = randomUUID();
    const businessDay = ctx.businessDay || chileBusinessDay();
    const maxRes = await db.execute({
      sql: `SELECT COALESCE(MAX(order_number), 0) AS m FROM sales WHERE business_day = ?`, args: [businessDay],
    });
    const orderNumber = Number(maxRes.rows[0].m) + 1;
    await db.batch([
      {
        sql: `INSERT INTO sales (id, client_uuid, user_id, total, payment_method, status,
                 payload_hash, synced_offline, business_day, order_number, kind, note, dispatch_status, sold_at,
                 is_backdated, backdate_reason)
               VALUES (?,?,?,?,?, 'CONFIRMADA', ?,?,?,?, 'LIBRE', ?, 'ENTREGADO', ?, ?, ?)`,
        args: [saleId, client_uuid, ctx.userId, free_amount, payment_method, ctx.payloadHash,
               ctx.syncedOffline ? 1 : 0, businessDay, orderNumber, note ? String(note).trim() : null,
               sold_at || new Date().toISOString(), ctx.backdated ? 1 : 0, ctx.backdateReason || null],
      },
      {
        sql: `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, severity, metadata, ip_address)
              VALUES (?,?, 'SALE_FREE', 'sales', ?, 'INFO', ?, ?)`,
        args: [randomUUID(), ctx.userId, saleId, JSON.stringify({ free_amount, payment_method, note }), ctx.ip || null],
      },
    ], 'write');
    return { status: 'CREATED', saleId, total: free_amount, orderNumber };
  }

  // Carga de modificadores elegidos (recargo desde DB, anti-tamper).
  const allOptionIds = [...new Set(items.flatMap((i) => Array.isArray(i.modifier_option_ids) ? i.modifier_option_ids : []))];
  const optionMap = new Map();
  if (allOptionIds.length) {
    const optRes = await db.execute({
      sql: `SELECT id, name, price_delta FROM modifier_options WHERE is_active = 1 AND id IN (${allOptionIds.map(() => '?').join(',')})`,
      args: allOptionIds,
    });
    for (const o of optRes.rows) optionMap.set(o.id, { name: o.name, price_delta: Number(o.price_delta) });
  }

  // Carga de productos + recetas en lote.
  const productIds = [...new Set(items.map((i) => i.product_id))];
  const placeholders = productIds.map(() => '?').join(',');

  const prodRes = await db.execute({
    sql: `SELECT id, price, is_active FROM products WHERE id IN (${placeholders})`,
    args: productIds,
  });
  const products = new Map(prodRes.rows.map((p) => [p.id, p]));

  const recipeRes = await db.execute({
    sql: `SELECT pr.product_id, pr.ingredient_id, pr.qty_per_unit,
                 i.name AS ing_name, i.stock_qty, i.cost_unit
          FROM product_recipes pr
          JOIN ingredients i ON i.id = pr.ingredient_id
          WHERE pr.product_id IN (${placeholders})`,
    args: productIds,
  });

  // Acumula consumo total de insumos a partir del BOM.
  const ingredientUse = new Map(); // ingredient_id -> { qty, name, stock }
  const saleId = randomUUID();
  const saleItems = [];
  let total = 0;

  for (const line of items) {
    const product = products.get(line.product_id);
    if (!product || !product.is_active) {
      const e = new Error('PRODUCTO_NO_DISPONIBLE'); e.status = 409; e.detail = line.product_id; throw e;
    }
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty <= 0) {
      const e = new Error('CANTIDAD_INVALIDA'); e.status = 400; throw e;
    }
    const unitPrice = Number(product.price);
    // Modificadores elegidos: recargo y nombres desde la DB (no del cliente).
    const chosen = (Array.isArray(line.modifier_option_ids) ? line.modifier_option_ids : [])
      .map((oid) => optionMap.get(oid)).filter(Boolean);
    const modsTotal = chosen.reduce((s, o) => s + o.price_delta, 0);
    const lineTotal = (unitPrice + modsTotal) * qty;
    total += lineTotal;
    saleItems.push({
      id: randomUUID(), sale_id: saleId, product_id: product.id,
      qty, unit_price: unitPrice, line_total: lineTotal,
      modifiers: chosen.length ? JSON.stringify(chosen.map((o) => ({ name: o.name, price_delta: o.price_delta }))) : null,
      modifiers_total: modsTotal,
    });

    for (const r of recipeRes.rows.filter((x) => x.product_id === product.id)) {
      const prev = ingredientUse.get(r.ingredient_id) ||
        { qty: 0, name: r.ing_name, stock: Number(r.stock_qty), cost: Number(r.cost_unit) };
      prev.qty += Number(r.qty_per_unit) * qty;
      ingredientUse.set(r.ingredient_id, prev);
    }
  }

  // Descuento (anti-tamper: viene firmado en el payload). Acotado al subtotal.
  const subtotal = total;
  const discount = Math.min(Math.max(0, Number(rawDiscount) || 0), subtotal);
  const deliveryFee = Math.max(0, Number(payload.delivery_fee) || 0);
  total = Math.round((subtotal - discount + deliveryFee) * 100) / 100;

  // Cliente / domicilio (upsert por teléfono, anti-tamper irrelevante: datos del cliente).
  let clientId = null;
  const cli = payload.client;
  if (cli && (cli.phone || cli.name)) {
    const { upsertClient } = await import('../controllers/clients.js');
    clientId = await upsertClient(db, cli);
  }
  const deliveryAddress = cli && cli.address ? String(cli.address).trim() : (payload.delivery_address || null);

  // Verificación de stock teórico ANTES de comprometer la transacción.
  for (const [ingId, use] of ingredientUse) {
    if (use.stock < use.qty) {
      const e = new Error('STOCK_INSUFICIENTE');
      e.status = 409; e.detail = { ingredient: use.name, need: use.qty, have: use.stock };
      throw e;
    }
  }

  // Número de orden correlativo por día (zona America/Santiago), asignado
  // por el servidor al sincronizar -> sin choques entre cajas ni offline.
  const businessDay = ctx.businessDay || chileBusinessDay();
  const maxRes = await db.execute({
    sql: `SELECT COALESCE(MAX(order_number), 0) AS m FROM sales WHERE business_day = ?`,
    args: [businessDay],
  });
  const orderNumber = Number(maxRes.rows[0].m) + 1;

  // Las ventas retroactivas entran como ENTREGADO (ya ocurrieron); no van al tablero.
  const dispatchStatus = ctx.backdated ? 'ENTREGADO' : 'PENDIENTE';

  // ---- Transacción atómica (batch) ----
  const stmts = [];

  stmts.push({
    sql: `INSERT INTO sales
            (id, client_uuid, user_id, total, subtotal, discount, delivery_fee, client_id, delivery_address,
             payment_method, status, payload_hash, synced_offline, business_day, order_number, dispatch_status, sold_at,
             is_backdated, backdate_reason)
          VALUES (?,?,?,?,?,?,?,?,?,?, 'CONFIRMADA', ?,?,?,?, ?, ?, ?, ?)`,
    args: [saleId, client_uuid, ctx.userId, total, subtotal, discount, deliveryFee, clientId, deliveryAddress,
           payment_method, ctx.payloadHash, ctx.syncedOffline ? 1 : 0, businessDay, orderNumber, dispatchStatus,
           sold_at || new Date().toISOString(), ctx.backdated ? 1 : 0, ctx.backdateReason || null],
  });

  for (const it of saleItems) {
    stmts.push({
      sql: `INSERT INTO sale_items (id, sale_id, product_id, qty, unit_price, modifiers, modifiers_total, line_total)
            VALUES (?,?,?,?,?,?,?,?)`,
      args: [it.id, it.sale_id, it.product_id, it.qty, it.unit_price, it.modifiers, it.modifiers_total, it.line_total],
    });
  }

  for (const [ingId, use] of ingredientUse) {
    // Descuenta stock teórico.
    stmts.push({
      sql: `UPDATE ingredients
            SET stock_qty = stock_qty - ?, updated_at = datetime('now')
            WHERE id = ?`,
      args: [use.qty, ingId],
    });
    // Traza del descuento como ajuste de inventario (tipo VENTA),
    // con el costo unitario congelado para el P&L histórico.
    stmts.push({
      sql: `INSERT INTO inventory_adjustments
              (id, ingredient_id, user_id, type, qty_delta, unit_cost, reason, sale_id)
            VALUES (?,?,?, 'VENTA', ?, ?, ?, ?)`,
      args: [randomUUID(), ingId, ctx.userId, -use.qty, use.cost,
             `Descuento BOM por venta ${client_uuid}`, saleId],
    });
  }

  // Auditoría dentro del mismo batch atómico.
  stmts.push({
    sql: `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, severity, metadata, ip_address)
          VALUES (?,?, 'SALE_SYNC', 'sales', ?, 'INFO', ?, ?)`,
    args: [randomUUID(), ctx.userId, saleId,
           JSON.stringify({ total, payment_method, offline: !!ctx.syncedOffline }), ctx.ip || null],
  });

  await db.batch(stmts, 'write'); // rollback automático si algo falla.

  return { status: 'CREATED', saleId, total, subtotal, discount, orderNumber };
}

/** Día hábil en zona America/Santiago, formato 'YYYY-MM-DD'. */
export function chileBusinessDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(d);
}
