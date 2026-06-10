// ============================================================
// Centro de Operaciones Diario — lógica de negocio.
// Reutiliza: sales, cash_sessions, cash_register_closures, expenses,
// inventory_adjustments (MERMA/VENTA/CONTEO) e ingredients. No duplica caja
// ni mermas: las lee. Solo persiste la capa operativa (día/checklist/tareas).
// ============================================================
import { randomUUID } from 'node:crypto';
import { getDb } from '../../db.js';

const round0 = (n) => Math.round(n || 0);
export const todayCl = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

// Plantillas fijas (semilla por día). critical => si falla genera tarea correctiva.
const OPENING_TEMPLATE = [
  ['Caja inicial verificada', 1], ['POS operativo', 1], ['Impresora operativa', 1],
  ['Pollo disponible', 1], ['Papas disponibles', 1], ['Bebidas disponibles', 1], ['Envases/packaging disponibles', 1],
  ['Área limpia', 0], ['Área de producción lista', 0], ['Personal presente', 1], ['Observaciones iniciales del turno', 0],
];
const CLOSING_TEMPLATE = [
  ['Caja final contada', 1], ['Merma del día registrada', 1], ['Conteo de inventario crítico', 1],
  ['Faltantes/quiebres registrados', 0], ['Equipos apagados', 0], ['Área limpia para mañana', 0],
  ['Pendientes para mañana', 0], ['Observación general del cierre', 0],
];

async function getConfig(db) {
  const rows = (await db.execute(`SELECT key, value FROM ops_config`)).rows;
  return Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
}

export async function ensureDay(db, day) {
  await db.execute({ sql: `INSERT OR IGNORE INTO operational_day (day) VALUES (?)`, args: [day] });
}

// Devuelve los ítems de un checklist; los siembra desde plantilla la primera vez.
export async function getChecklist(day, phase) {
  const db = getDb();
  await ensureDay(db, day);
  let rows = (await db.execute({ sql: `SELECT * FROM ops_checklist_item WHERE day=? AND phase=? ORDER BY sort`, args: [day, phase] })).rows;
  if (!rows.length) {
    const tpl = phase === 'APERTURA' ? OPENING_TEMPLATE : CLOSING_TEMPLATE;
    for (let i = 0; i < tpl.length; i++) {
      await db.execute({
        sql: `INSERT INTO ops_checklist_item (id, day, phase, label, is_critical, sort) VALUES (?,?,?,?,?,?)`,
        args: [randomUUID(), day, phase, tpl[i][0], tpl[i][1], i],
      });
    }
    rows = (await db.execute({ sql: `SELECT * FROM ops_checklist_item WHERE day=? AND phase=? ORDER BY sort`, args: [day, phase] })).rows;
  }
  return rows;
}

// Actualiza un ítem; si un crítico falla (NO) crea tarea correctiva ligada al ítem.
export async function updateChecklistItem(id, { status, note, responsibleId, userId }) {
  const db = getDb();
  const item = (await db.execute({ sql: `SELECT * FROM ops_checklist_item WHERE id=?`, args: [id] })).rows[0];
  if (!item) return null;
  await db.execute({
    sql: `UPDATE ops_checklist_item SET status=COALESCE(?,status), note=?, responsible_id=COALESCE(?,responsible_id), done_at=datetime('now') WHERE id=?`,
    args: [status || null, note ?? item.note, responsibleId || null, id],
  });
  if (status === 'NO' && item.is_critical) {
    await upsertTask(db, {
      day: item.day, kind: 'TAREA', title: `Resolver: ${item.label}`,
      description: note || `Ítem crítico de ${item.phase.toLowerCase()} marcado como NO.`,
      impact: 'Bloquea apertura/cierre completo', suggested_action: 'Atender y volver a marcar el ítem',
      priority: 'alta', source_type: 'CHECKLIST', source_id: id, createdBy: userId,
    });
  }
  await recomputeStatus(db, item.day, item.phase);
  return getChecklist(item.day, item.phase);
}

async function recomputeStatus(db, day, phase) {
  const items = (await db.execute({ sql: `SELECT status, is_critical FROM ops_checklist_item WHERE day=? AND phase=?`, args: [day, phase] })).rows;
  const tocados = items.filter((i) => i.status !== 'PENDIENTE').length;
  const criticoFallidoSinResolver = items.some((i) => i.is_critical && i.status === 'NO');
  const obligatoriosOk = items.filter((i) => i.is_critical).every((i) => i.status === 'SI' || i.status === 'NA');
  let status;
  if (tocados === 0) status = phase === 'APERTURA' ? 'NO_INICIADA' : 'NO_INICIADO';
  else if (obligatoriosOk && !criticoFallidoSinResolver && tocados === items.length) status = phase === 'APERTURA' ? 'COMPLETA' : 'COMPLETO';
  else status = 'PARCIAL';
  const col = phase === 'APERTURA' ? 'opening_status' : 'closing_status';
  await db.execute({ sql: `UPDATE operational_day SET ${col}=?, updated_at=datetime('now') WHERE day=?`, args: [status, day] });
  return status;
}

// --- Tareas / alertas ---
export async function upsertTask(db, t) {
  // Si trae source_id, es idempotente (no duplica). Si no, crea siempre.
  if (t.source_id) {
    const ex = (await db.execute({ sql: `SELECT id FROM ops_task WHERE day=? AND source_type=? AND source_id=?`, args: [t.day, t.source_type, t.source_id] })).rows[0];
    if (ex) return ex.id;
  }
  const id = randomUUID();
  await db.execute({
    sql: `INSERT INTO ops_task (id, day, kind, title, description, impact, suggested_action, priority, responsible_id, due_date, status, source_type, source_id, created_by)
          VALUES (?,?,?,?,?,?,?,?,?,?, 'pendiente', ?, ?, ?)`,
    args: [id, t.day || null, t.kind || 'TAREA', t.title, t.description || null, t.impact || null, t.suggested_action || null,
           t.priority || 'media', t.responsibleId || null, t.due_date || null, t.source_type || 'MANUAL', t.source_id || null, t.createdBy || null],
  });
  return id;
}

export async function listTasks({ day, status }) {
  const db = getDb();
  const cl = [], args = [];
  if (day) { cl.push('day=?'); args.push(day); }
  if (status) { cl.push('status=?'); args.push(status); }
  const where = cl.length ? `WHERE ${cl.join(' AND ')}` : '';
  const rows = (await db.execute({
    sql: `SELECT t.*, u.full_name AS responsible FROM ops_task t LEFT JOIN users u ON u.id=t.responsible_id
          ${where} ORDER BY (status IN ('resuelta','descartada')) ASC,
            CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, t.created_at DESC`,
    args,
  })).rows;
  const hoy = todayCl();
  return rows.map((t) => ({ ...t, overdue: t.due_date && t.due_date < hoy && !['resuelta', 'descartada'].includes(t.status) }));
}

export async function updateTask(id, fields, userId) {
  const db = getDb();
  const allowed = ['title', 'description', 'priority', 'responsible_id', 'due_date', 'status', 'resolution'];
  const sets = [], args = [];
  for (const k of allowed) if (k in fields) { sets.push(`${k}=?`); args.push(fields[k]); }
  if (!sets.length) return null;
  sets.push(`updated_at=datetime('now')`); args.push(id);
  await db.execute({ sql: `UPDATE ops_task SET ${sets.join(', ')} WHERE id=?`, args });
  return (await db.execute({ sql: `SELECT * FROM ops_task WHERE id=?`, args: [id] })).rows[0];
}

// --- Inventario crítico (reutiliza ingredients) ---
export async function criticalInventory() {
  const db = getDb();
  const rows = (await db.execute(`SELECT id, name, unit, stock_qty, min_stock_qty FROM ingredients WHERE is_active=1 AND is_critical=1 ORDER BY name`)).rows;
  const items = rows.map((r) => {
    const stock = Number(r.stock_qty), min = Number(r.min_stock_qty);
    const estado = min > 0 && stock <= 0 ? 'CRITICO' : min > 0 && stock < min ? 'RIESGO' : 'OK';
    return { id: r.id, name: r.name, unit: r.unit, stock_qty: stock, min_stock_qty: min, estado };
  });
  const peor = items.some((i) => i.estado === 'CRITICO') ? 'CRITICO' : items.some((i) => i.estado === 'RIESGO') ? 'RIESGO' : 'OK';
  return { estado: peor, items };
}

// --- Dashboard del día (KPIs esenciales, reutilizando datos reales) ---
export async function dashboard(day) {
  const db = getDb();
  await ensureDay(db, day);
  const cfg = await getConfig(db);
  const od = (await db.execute({ sql: `SELECT * FROM operational_day WHERE day=?`, args: [day] })).rows[0];
  const dRange = [`${day} 00:00:00`, `${day} 23:59:59`];

  // Ventas del día (por business_day; preciso en hora Chile).
  const v = (await db.execute({ sql: `SELECT COUNT(*) n, COALESCE(SUM(total),0) total FROM sales WHERE status='CONFIRMADA' AND business_day=?`, args: [day] })).rows[0];
  const ventas = Number(v.total), pedidos = Number(v.n);
  const ticket = pedidos ? round0(ventas / pedidos) : 0;

  // Food cost (COGS por ventas del día / ventas).
  const cogs = Number((await db.execute({ sql: `SELECT COALESCE(SUM(si.qty*pr.qty_per_unit*i.cost_unit),0) c
          FROM sale_items si JOIN sales s ON s.id=si.sale_id AND s.status='CONFIRMADA' AND s.business_day=?
          JOIN product_recipes pr ON pr.product_id=si.product_id JOIN ingredients i ON i.id=pr.ingredient_id`, args: [day] })).rows[0].c);
  const food_cost_pct = ventas > 0 ? round0(cogs / ventas * 100) : null;

  // Merma del día (monto y nº de registros).
  const m = (await db.execute({ sql: `SELECT COUNT(*) n, COALESCE(SUM(ABS(qty_delta)*unit_cost),0) monto FROM inventory_adjustments WHERE type='MERMA' AND created_at>=? AND created_at<=?`, args: dRange })).rows[0];
  const merma_monto = round0(Number(m.monto)), merma_n = Number(m.n);

  // Caja: esperada (efectivo) en vivo + real/diferencia del cierre del día si existe.
  const sess = (await db.execute(`SELECT * FROM cash_sessions WHERE status='OPEN' ORDER BY opened_at DESC LIMIT 1`)).rows[0];
  let caja_esperada = null;
  if (sess) {
    const vef = Number((await db.execute({ sql: `SELECT COALESCE(SUM(total),0) t FROM sales WHERE status='CONFIRMADA' AND payment_method='EFECTIVO' AND sold_at>=?`, args: [sess.opened_at] })).rows[0].t);
    const gef = Number((await db.execute({ sql: `SELECT COALESCE(SUM(amount),0) t FROM expenses WHERE payment_method='EFECTIVO' AND spent_at>=?`, args: [sess.opened_at] })).rows[0].t);
    const mov = (await db.execute({ sql: `SELECT type, COALESCE(SUM(amount),0) t FROM cash_movements WHERE session_id=? GROUP BY type`, args: [sess.id] })).rows;
    const ingreso = Number(mov.find((x) => x.type === 'INGRESO')?.t || 0), deposito = Number(mov.find((x) => x.type === 'DEPOSITO')?.t || 0);
    caja_esperada = round0(Number(sess.opening_float) + vef - gef + ingreso - deposito);
  }
  const cierre = (await db.execute({ sql: `SELECT efectivo_declarado, diff_efectivo, diff_total FROM cash_register_closures WHERE substr(period_end,1,10)=? ORDER BY created_at DESC LIMIT 1`, args: [day] })).rows[0];
  const caja_real = cierre ? round0(Number(cierre.efectivo_declarado)) : null;
  const caja_diferencia = cierre ? round0(Number(cierre.diff_efectivo)) : (caja_esperada != null ? null : null);

  const inv = await criticalInventory();

  // Conteos de tareas/alertas.
  const tc = (await db.execute({ sql: `SELECT kind, COUNT(*) n FROM ops_task WHERE day=? AND status IN ('pendiente','en_proceso') GROUP BY kind`, args: [day] })).rows;
  const alertas_activas = Number(tc.find((x) => x.kind === 'ALERTA')?.n || 0);
  const tareas_pendientes = Number(tc.find((x) => x.kind === 'TAREA')?.n || 0);
  const vencidas = Number((await db.execute({ sql: `SELECT COUNT(*) n FROM ops_task WHERE status IN ('pendiente','en_proceso') AND due_date IS NOT NULL AND due_date < ?`, args: [todayCl()] })).rows[0].n);

  // Semáforos
  const sem = (val, ok, warn) => (val >= ok ? 'verde' : val >= warn ? 'amarillo' : 'rojo');
  const meta = cfg.daily_sales_target || 0;
  return {
    day, generated_at: new Date().toISOString(),
    config: cfg,
    kpis: {
      ventas: { value: ventas, meta, pct_meta: meta ? round0(ventas / meta * 100) : null, semaforo: meta ? sem(ventas, meta, meta * 0.7) : 'verde' },
      pedidos: { value: pedidos },
      ticket: { value: ticket, meta: cfg.ticket_target, semaforo: cfg.ticket_target ? sem(ticket, cfg.ticket_target, cfg.ticket_target * 0.8) : 'verde' },
      caja_esperada: { value: caja_esperada },
      caja_real: { value: caja_real },
      caja_diferencia: { value: caja_diferencia, semaforo: caja_diferencia == null ? 'gris' : Math.abs(caja_diferencia) <= (cfg.cash_diff_tolerance || 0) ? 'verde' : 'rojo' },
      food_cost: { value: food_cost_pct, semaforo: food_cost_pct == null ? 'gris' : food_cost_pct <= 35 ? 'verde' : food_cost_pct <= 45 ? 'amarillo' : 'rojo' },
      merma: { value: merma_monto, n: merma_n, umbral: cfg.waste_threshold_clp, semaforo: merma_monto <= (cfg.waste_threshold_clp || Infinity) ? 'verde' : 'rojo' },
      labor: { value: null, nota: 'Sin registro de horas trabajadas (pendiente de integrar).' },
    },
    inventario_critico: inv.estado,
    apertura: od.opening_status,
    cierre: od.closing_status,
    alertas_activas, tareas_pendientes, tareas_vencidas: vencidas,
  };
}

// --- Motor de alertas por excepción (idempotente por día+causa) ---
export async function evaluateAlerts(day, userId) {
  const db = getDb();
  const d = await dashboard(day);
  const k = d.kpis, cfg = d.config;
  const add = (source_id, title, impact, action, priority = 'alta') =>
    upsertTask(db, { day, kind: 'ALERTA', title, impact, suggested_action: action, priority, source_type: 'ALERT', source_id, createdBy: userId });

  const creadas = [];
  if (cfg.daily_sales_target && k.ventas.value < cfg.daily_sales_target * 0.7) { await add('venta_bajo_meta', 'Venta del día bajo meta', `Vas en $${k.ventas.value.toLocaleString('es-CL')} de $${cfg.daily_sales_target.toLocaleString('es-CL')}`, 'Empujar combos/upsell, revisar horas pico'); creadas.push('venta_bajo_meta'); }
  if (cfg.ticket_target && k.ticket.value > 0 && k.ticket.value < cfg.ticket_target * 0.8) { await add('ticket_bajo', 'Ticket promedio bajo', `Ticket $${k.ticket.value.toLocaleString('es-CL')} vs meta $${cfg.ticket_target.toLocaleString('es-CL')}`, 'Sugerir bebidas/agregados en cada pedido'); creadas.push('ticket_bajo'); }
  if (k.merma.value > (cfg.waste_threshold_clp || Infinity)) { await add('merma_alta', 'Merma sobre umbral', `Merma del día $${k.merma.value.toLocaleString('es-CL')}`, 'Revisar sobreproducción y manejo de insumos'); creadas.push('merma_alta'); }
  if (k.caja_diferencia.value != null && Math.abs(k.caja_diferencia.value) > (cfg.cash_diff_tolerance || 0)) { await add('descuadre_caja', 'Descuadre de caja', `Diferencia $${k.caja_diferencia.value.toLocaleString('es-CL')}`, 'Recontar y registrar comentario obligatorio'); creadas.push('descuadre_caja'); }
  if (d.inventario_critico === 'CRITICO' || d.inventario_critico === 'RIESGO') { await add('inv_critico', `Inventario crítico: ${d.inventario_critico}`, 'Riesgo de quiebre de stock', 'Reponer insumos bajo mínimo', d.inventario_critico === 'CRITICO' ? 'alta' : 'media'); creadas.push('inv_critico'); }
  if (d.apertura !== 'COMPLETA') { await add('apertura_incompleta', 'Apertura incompleta', 'Faltan verificaciones de inicio', 'Completar checklist de apertura', 'media'); creadas.push('apertura_incompleta'); }

  return { day, evaluadas: creadas.length, alertas: creadas };
}

// --- Apertura / cierre del día ---
export async function openDay(day, userId) {
  const db = getDb();
  await ensureDay(db, day);
  await db.execute({ sql: `UPDATE operational_day SET opened_by=COALESCE(opened_by,?), opened_at=COALESCE(opened_at,datetime('now')), updated_at=datetime('now') WHERE day=?`, args: [userId, day] });
  return dashboard(day);
}

export async function closeDay(day, userId, { notes } = {}) {
  const db = getDb();
  await ensureDay(db, day);
  // Validaciones: conteo de inventario crítico hecho (siembra el checklist si falta).
  const items = await getChecklist(day, 'CIERRE');
  const conteo = items.find((i) => /conteo de inventario/i.test(i.label));
  if (conteo && conteo.status === 'PENDIENTE') return { error: 'FALTA_CONTEO_INVENTARIO' };
  const snap = await dashboard(day);
  await db.execute({ sql: `UPDATE operational_day SET closed_by=?, closed_at=datetime('now'), kpi_snapshot=?, notes=COALESCE(?,notes), updated_at=datetime('now') WHERE day=?`,
    args: [userId, JSON.stringify(snap.kpis), notes || null, day] });
  return { ok: true, snapshot: snap };
}
