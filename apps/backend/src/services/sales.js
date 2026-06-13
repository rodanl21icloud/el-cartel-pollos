// ============================================================
// Servicio de ventas: registro transaccional + descuento BOM.
// - Idempotente por client_uuid (reintentos offline seguros).
// - Atómico: venta + items + descuento de insumos + auditoría
//   ocurren en una sola transacción libSQL (batch).
// ============================================================
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';
import { commitWithAudit } from './audit.js';

// --- Control de descuentos (Fase 1.2) ---
const DISCOUNT_MAX_PCT = Number(process.env.DISCOUNT_MAX_PCT || 15);   // % de subtotal sin autorización
const OVERRIDE_ROLES = new Set(['SUPERVISOR', 'GERENCIA', 'ADMIN']);   // roles que autorizan (no toca la matriz)

// Valida credenciales de un supervisor con poder para autorizar descuentos.
// Devuelve el id del supervisor o null. Nunca expone/loguea la contraseña.
async function validateSupervisor(db, auth) {
  const username = String(auth?.username || '').trim().toLowerCase();
  const password = String(auth?.password || '');
  if (!username || !password) return null;
  const u = (await db.execute({
    sql: `SELECT id, password_hash, role, is_active FROM users WHERE username = ?`, args: [username],
  })).rows[0];
  if (!u || !u.is_active || !OVERRIDE_ROLES.has(u.role)) return null;
  return (await bcrypt.compare(password, u.password_hash)) ? u.id : null;
}

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
    await commitWithAudit([
      {
        sql: `INSERT INTO sales (id, client_uuid, user_id, total, payment_method, status,
                 payload_hash, synced_offline, business_day, order_number, kind, note, dispatch_status, sold_at,
                 is_backdated, backdate_reason)
               VALUES (?,?,?,?,?, 'CONFIRMADA', ?,?,?,?, 'LIBRE', ?, 'ENTREGADO', ?, ?, ?)`,
        args: [saleId, client_uuid, ctx.userId, free_amount, payment_method, ctx.payloadHash,
               ctx.syncedOffline ? 1 : 0, businessDay, orderNumber, note ? String(note).trim() : null,
               sold_at || new Date().toISOString(), ctx.backdated ? 1 : 0, ctx.backdateReason || null],
      },
    ], { userId: ctx.userId, action: 'SALE_FREE', entity: 'sales', entityId: saleId, severity: 'INFO',
         metadata: { free_amount, payment_method, note }, ip: ctx.ip });
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
      note: line.note ? String(line.note).trim().slice(0, 200) : null,
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

  // --- Control de descuentos (Fase 1.2): umbral % -> exige supervisor ---
  let discountAuthBy = null;
  if (discount > 0) {
    const pct = subtotal > 0 ? (discount / subtotal) * 100 : 0;
    if (pct > DISCOUNT_MAX_PCT) {
      discountAuthBy = await validateSupervisor(db, payload.supervisor_auth);
      if (!discountAuthBy) {
        const e = new Error('DISCOUNT_REQUIRES_SUPERVISOR');
        e.status = 403; e.detail = { max_pct: DISCOUNT_MAX_PCT, applied_pct: Math.round(pct) };
        throw e;
      }
    }
  }

  // Cliente / domicilio (upsert por teléfono, anti-tamper irrelevante: datos del cliente).
  let clientId = null;
  const cli = payload.client;
  if (cli && (cli.phone || cli.name)) {
    const { upsertClient } = await import('../controllers/clients.js');
    clientId = await upsertClient(db, cli);
  }
  // Si dio su WhatsApp para el aviso "pedido listo", lo registramos/vinculamos
  // como cliente -> queda disponible para seguimiento comercial, campañas y loyalty.
  if (!clientId && payload.notify_phone) {
    const { upsertClient } = await import('../controllers/clients.js');
    clientId = await upsertClient(db, { phone: payload.notify_phone, notes: 'Aviso WhatsApp (POS)' });
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
             is_backdated, backdate_reason, notify_phone)
          VALUES (?,?,?,?,?,?,?,?,?,?, 'CONFIRMADA', ?,?,?,?, ?, ?, ?, ?, ?)`,
    args: [saleId, client_uuid, ctx.userId, total, subtotal, discount, deliveryFee, clientId, deliveryAddress,
           payment_method, ctx.payloadHash, ctx.syncedOffline ? 1 : 0, businessDay, orderNumber, dispatchStatus,
           sold_at || new Date().toISOString(), ctx.backdated ? 1 : 0, ctx.backdateReason || null,
           (payload.notify_phone || null)],
  });

  for (const it of saleItems) {
    stmts.push({
      sql: `INSERT INTO sale_items (id, sale_id, product_id, qty, unit_price, modifiers, modifiers_total, line_total, note)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [it.id, it.sale_id, it.product_id, it.qty, it.unit_price, it.modifiers, it.modifiers_total, it.line_total, it.note],
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

  // Auditoría encadenada DENTRO del mismo batch atómico (SALE_SYNC + SALE_DISCOUNT si aplica).
  const audits = [{
    userId: ctx.userId, action: 'SALE_SYNC', entity: 'sales', entityId: saleId, severity: 'INFO',
    metadata: { total, payment_method, offline: !!ctx.syncedOffline }, ip: ctx.ip,
  }];
  if (discount > 0) {
    audits.push({
      userId: ctx.userId, action: 'SALE_DISCOUNT', entity: 'sales', entityId: saleId,
      severity: discountAuthBy ? 'ALERT' : 'INFO',
      metadata: { subtotal, discount, pct: Math.round((discount / subtotal) * 100), authorized_by: discountAuthBy },
      ip: ctx.ip,
    });
  }
  await commitWithAudit(stmts, audits); // rollback automático si algo falla.

  // Devengo de puntos de fidelización (efecto secundario NO crítico: nunca rompe la venta).
  if (clientId && total > 0) {
    try {
      const { accrueForSale } = await import('./marketing/commercial.js');
      await accrueForSale({ clientId, saleId, total });
    } catch { /* loyalty es best-effort; la venta ya quedó registrada */ }
  }

  return { status: 'CREATED', saleId, total, subtotal, discount, orderNumber };
}

/** Día hábil en zona America/Santiago, formato 'YYYY-MM-DD'. */
export function chileBusinessDay(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(d);
}
