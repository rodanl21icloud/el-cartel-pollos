import { useEffect, useState } from 'react';
import { api, apiDownload } from '../lib/api.js';
import { buildCustomerReceiptHTML } from '../lib/receipt.js';
import { brandLogoUrl } from '../config/brand.js';
import { openPrint } from '../lib/print.js';

// ============================================================
// Módulo "Movimientos" — clon visual de alta fidelidad (estilo Treinta):
// tabs, filtros, KPIs, tabla y drawer "Detalle de la venta".
// Paleta vía variables CSS en .mov (verde SaaS ahora; lista para rebrandear
// a pollería negro/amarillo/rojo cambiando solo las variables de :root .mov).
// Modo standalone (acciones + filtros) y embebido en Finanzas (usa `period`).
// ============================================================
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const METODO = { EFECTIVO: 'Efectivo', POS: 'Tarjeta', TRANSFERENCIA: 'Transferencia' };
const fmt = (iso) => { try { return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
const fmtLong = (iso) => { try { const d = new Date(iso); return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + ' | ' + d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return ''; } };

function rangeOf(mode, anchor) {
  const base = mode === 'Mensual' ? new Date(anchor + '-01T00:00:00') : new Date(anchor + 'T00:00:00');
  const d = isNaN(base) ? new Date() : base; d.setHours(0, 0, 0, 0);
  let from = new Date(d), to = new Date(d); to.setHours(23, 59, 59, 999);
  if (mode === 'Semanal') { from.setDate(d.getDate() - ((d.getDay() + 6) % 7)); to = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999); }
  else if (mode === 'Mensual') { from.setDate(1); to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
  return { from: from.toISOString(), to: to.toISOString() };
}

const QF = [['', 'Todos'], ['INGRESO', 'Ingresos'], ['EGRESO', 'Egresos'], ['COBRAR', 'Por cobrar'], ['PAGAR', 'Por pagar']];

export default function Movimientos({ period: extPeriod, onGo, canVoid } = {}) {
  const embedded = !!extPeriod;
  const [mode, setMode] = useState('Mensual');
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, mode === 'Mensual' ? 7 : 10));
  const [forced, setForced] = useState(null); // período forzado (al ver el detalle de un turno)
  const period = extPeriod || forced || rangeOf(mode, anchor.length === 7 ? anchor : anchor.slice(0, 7));
  const pickAnchor = (v) => { setForced(null); setAnchor(v); };
  const [topTab, setTopTab] = useState('tx');
  const [qf, setQf] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [closures, setClosures] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [sel, setSel] = useState(null); // movimiento seleccionado -> drawer
  const [selC, setSelC] = useState(null); // cierre seleccionado -> drawer resumen del turno

  const noImpl = qf === 'COBRAR' || qf === 'PAGAR';

  async function loadTx() {
    if (topTab !== 'tx') return;
    setError(''); setData(null);
    if (noImpl) { setData({ items: [], kpis: null, _noimpl: true }); return; }
    const p = new URLSearchParams({ from: period.from, to: period.to });
    if (qf === 'INGRESO' || qf === 'EGRESO') p.set('type', qf);
    if (q.trim()) p.set('q', q.trim());
    try { setData(await api(`/reports/movements?${p}`)); }
    catch (e) { setError(e.message === 'PERMISO_DENEGADO' ? 'No tienes permiso para ver movimientos.' : e.message); }
  }
  async function loadCierres() {
    if (topTab !== 'cierres') return;
    setError(''); setClosures(null);
    try { setClosures(await api('/reports/closures')); } catch (e) { setError(e.message); }
  }
  useEffect(() => { loadTx(); /* eslint-disable-next-line */ }, [period.from, period.to, qf, topTab]);
  useEffect(() => { const t = setTimeout(loadTx, 300); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q]);
  useEffect(() => { loadCierres(); /* eslint-disable-next-line */ }, [topTab]);

  function changeMode(m) {
    setForced(null); setMode(m);
    setAnchor(new Date().toISOString().slice(0, m === 'Mensual' ? 7 : 10));
  }
  async function descargar() {
    setDownloading(true);
    try {
      const tipo = qf === 'INGRESO' ? 'ventas' : 'movimientos';
      await apiDownload(`/reports/export?type=${tipo}&from=${period.from}&to=${period.to}`, `${tipo}_${period.from.slice(0, 10)}.csv`);
    } catch (e) { setError(e.message); } finally { setDownloading(false); }
  }

  const k = data?.kpis;

  return (
    <div className="mov">
      <style>{CSS}</style>

      {/* Encabezado */}
      <div className="mov-head">
        <h2>Movimientos</h2>
        {!embedded && <button className="btn btn-dark" onClick={() => onGo?.('cash')}>{I.cash}Abrir caja</button>}
      </div>

      {/* Tabs grandes */}
      <div className="seg">
        <button className={`seg-b ${topTab === 'tx' ? 'on' : ''}`} onClick={() => setTopTab('tx')}>Transacciones</button>
        <button className={`seg-b ${topTab === 'cierres' ? 'on' : ''}`} onClick={() => setTopTab('cierres')}>Cierres de caja</button>
      </div>

      {topTab === 'tx' && (
        <>
          {/* Filtros */}
          <div className="filters">
            <button className="btn" onClick={loadTx}>{I.filter}Filtrar</button>
            {!embedded && (
              <>
                <div className="select-wrap">
                  <select value={mode} onChange={(e) => changeMode(e.target.value)}><option>Diario</option><option>Semanal</option><option>Mensual</option></select>
                  {I.chev}
                </div>
                <div className="input-ico">
                  {mode === 'Mensual'
                    ? <input type="month" value={anchor.slice(0, 7)} onChange={(e) => pickAnchor(e.target.value)} />
                    : <input type="date" value={anchor.length === 7 ? anchor + '-01' : anchor} onChange={(e) => pickAnchor(e.target.value)} />}
                </div>
              </>
            )}
            <div className="input-ico grow">{I.search}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar concepto..." /></div>
            <button className="btn btn-icon" onClick={descargar} disabled={downloading} title="Descargar reporte">{I.download}</button>
          </div>

          {/* KPIs */}
          <div className="kpis">
            <Kpi icon={I.trend} tint="g" label="Balance" value={money(k?.balance)} valClass={k && k.balance < 0 ? 'v-red' : 'v-dark'} />
            <Kpi icon={I.cash} tint="g" label="Ventas totales" value={money(k?.ventas?.total)} valClass="v-dark" />
            <Kpi icon={I.cash} tint="r" label="Gastos totales" value={money(k?.gastos?.total)} valClass="v-red" />
          </div>

          {/* Quick filters (subtabs underline) */}
          <div className="subtabs">
            {QF.map(([id, label]) => (
              <button key={id} className={`subtab ${qf === id ? 'on' : ''}`} onClick={() => setQf(id)}>{label}</button>
            ))}
          </div>

          {/* Tabla */}
          <div className="card">
            {error ? <ErrorBox msg={error} onRetry={loadTx} />
              : !data ? <Loading />
                : data._noimpl ? <Empty title="Sin cuentas pendientes" hint="Tu negocio opera al contado: no hay cuentas por cobrar/pagar." />
                  : !data.items.length ? <Empty title="Sin movimientos en el período" hint="Cambia el período o el filtro." />
                    : (
                      <table>
                        <thead><tr><th>Concepto</th><th className="r">Valor</th><th>Medio de pago</th><th>Fecha y hora</th></tr></thead>
                        <tbody>
                          {data.items.map((m) => (
                            <tr key={m.id} onClick={() => setSel(m)} className="row">
                              <td><div className="concepto"><span className={`chip ${m.tipo === 'INGRESO' ? 'chip-g' : 'chip-r'}`}>{m.tipo === 'INGRESO' ? I.cash : I.reg}</span><div><div className="c-name">{m.concepto}</div>{m.categoria && <div className="c-sub">{m.categoria}</div>}</div></div></td>
                              <td className={`r val ${m.tipo === 'INGRESO' ? 'v-dark' : 'v-red'}`}>{m.tipo === 'INGRESO' ? '' : '−'}{money(m.valor)}</td>
                              <td className="muted">{METODO[m.medio_pago] || m.medio_pago}</td>
                              <td className="muted nowrap">{fmt(m.fecha)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
          </div>
          {data?.truncated && <p className="note">Mostrando los más recientes. Acota el período o descarga el reporte completo.</p>}
        </>
      )}

      {topTab === 'cierres' && (
        <div className="card">
          {error ? <ErrorBox msg={error} onRetry={loadCierres} />
            : !closures ? <Loading />
              : !closures.length ? <Empty title="Sin cierres de caja" hint="Aparecerán al cerrar la caja del turno." />
                : (
                  <table>
                    <thead><tr><th>Período</th><th className="r">Fondo inicial</th><th className="r">Diferencia</th><th>Estado</th><th>Fecha</th></tr></thead>
                    <tbody>
                      {closures.map((c) => (
                        <tr key={c.id} onClick={() => setSelC(c)} className="row">
                          <td className="nowrap">{fmt(c.period_start)} → {fmt(c.period_end)}</td>
                          <td className="r muted">{money(c.opening_float)}</td>
                          <td className={`r val ${c.has_descuadre ? 'v-red' : 'v-dark'}`}>{money(c.diff_total)}</td>
                          <td>{c.has_descuadre ? <span className="badge bad">Descuadre</span> : <span className="badge ok">Cuadrado</span>}</td>
                          <td className="muted nowrap">{fmt(c.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
        </div>
      )}

      {/* Drawer detalle */}
      {sel && <Drawer m={sel} onClose={() => setSel(null)} onGo={onGo} canVoid={canVoid} onChanged={() => { loadTx(); }} />}
      {selC && <ClosureDrawer id={selC.id} onClose={() => setSelC(null)} onVerTx={(p) => { setForced(p); setTopTab('tx'); setSelC(null); }} onChanged={() => loadCierres()} />}
    </div>
  );
}

function Kpi({ icon, tint, label, value, valClass }) {
  return (
    <div className="kpi">
      <span className={`kpi-ico ${tint === 'r' ? 'tint-r' : 'tint-g'}`}>{icon}</span>
      <div><div className="kpi-lbl">{label}</div><div className={`kpi-val ${valClass}`}>{value}</div></div>
    </div>
  );
}

function Drawer({ m, onClose, onGo, canVoid, onChanged }) {
  const ingreso = m.tipo === 'INGRESO';
  const [busy, setBusy] = useState(false);
  const Row = ({ ico, label, value, red }) => (
    <div className="d-row"><span className="d-row-l">{ico}{label}</span><span className={`d-row-v ${red ? 'v-red' : ''}`}>{value ?? '—'}</span></div>
  );

  const [printing, setPrinting] = useState(false);
  const [det, setDet] = useState(null); // ítems del recibo (ventas)
  const [editing, setEditing] = useState(false);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState({ category_id: '', amount: '', payment_method: 'EFECTIVO', description: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (ingreso) api(`/sales/${m.id}/receipt`).then(setDet).catch(() => setDet(null)); /* eslint-disable-next-line */ }, [m.id]);
  async function comprobante() {
    const w = window.open('', '_blank', 'width=400,height=640'); if (!w) return;
    if (ingreso) {
      // Comprobante térmico real del POS (58/80mm, logo, folio, auto-print + corte).
      setPrinting(true);
      try {
        const [data, settings] = await Promise.all([api(`/sales/${m.id}/receipt`), api('/settings')]);
        w.document.write(buildCustomerReceiptHTML(data, settings || {}));
        w.document.close();
      } catch (e) { w.close(); alert(e.message); } finally { setPrinting(false); }
      return;
    }
    // Gasto: vale simple (no es una venta del POS).
    const r = (l, v) => `<tr><td style="color:#6B7280;padding:4px 0">${l}</td><td style="text-align:right;font-weight:700">${v}</td></tr>`;
    w.document.write(`<html><head><title>Vale de egreso</title><style>@page{size:80mm auto;margin:2mm}body{font-family:'Courier New',monospace;padding:8px;color:#111}h1{font-size:14px;letter-spacing:1px;text-align:center;margin:0 0 2px}.s{text-align:center;color:#555;font-size:12px;margin-bottom:12px}.tot{border-top:1px dashed #000;border-bottom:1px dashed #000;padding:8px 0;margin:8px 0;text-align:center}.tot b{font-size:20px}table{width:100%;font-size:12px;border-collapse:collapse}</style></head><body>
      <h1>VALE DE EGRESO</h1><div class="s">${m.concepto}${m.ref ? ' · ' + m.ref : ''}</div>
      <div class="tot"><div style="font-size:11px;color:#555">VALOR</div><b>${money(m.valor)}</b></div>
      <table>${r('Fecha y hora', fmtLong(m.fecha))}${r('Método de pago', METODO[m.medio_pago] || m.medio_pago)}${r('Proveedor', m.cliente || '—')}${r('Registró', m.empleado || '—')}</table>
      <div style="height:8mm"></div>
      <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script></body></html>`);
    w.document.close();
  }
  async function editar() {
    if (ingreso) { onGo?.('ventas'); onClose(); return; } // las ventas confirmadas no se editan: se anulan
    try {
      const c = await api('/expenses/categories');
      setCats(c);
      const match = c.find((x) => x.name === m.categoria);
      setForm({ category_id: match?.id || c[0]?.id || '', amount: m.valor, payment_method: m.medio_pago || 'EFECTIVO', description: m.concepto });
      setEditing(true);
    } catch (e) { alert(e.message); }
  }
  async function saveEdit() {
    if (!(Number(form.amount) > 0) || !form.description.trim() || !form.category_id) { alert('Completa monto, descripción y categoría.'); return; }
    setSaving(true);
    try {
      await api(`/expenses/${m.id}`, { method: 'PUT', body: { category_id: form.category_id, amount: Number(form.amount), payment_method: form.payment_method, description: form.description.trim() } });
      onChanged?.(); onClose();
    } catch (e) { alert(e.message === 'PERMISO_DENEGADO' ? 'No tienes permiso para editar gastos.' : e.message); setSaving(false); }
  }
  async function eliminar() {
    const msg = ingreso ? '¿Anular esta venta? Se restaurará el inventario consumido.' : '¿Eliminar este gasto? No se puede deshacer.';
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      if (ingreso) await api(`/sales/${m.id}/void`, { method: 'POST', body: { reason: 'Anulada desde Movimientos' } });
      else await api(`/expenses/${m.id}`, { method: 'DELETE' });
      onChanged?.(); onClose();
    } catch (e) { alert(e.message === 'PERMISO_DENEGADO' ? 'No tienes permiso para esta acción.' : e.message); setBusy(false); }
  }

  return (
    <>
      <div className="d-overlay" onClick={onClose} />
      <aside className="drawer">
        <div className="d-head">
          <div className="d-head-l"><span className="d-ico">{I.reg}</span><b>{editing ? 'Editar gasto' : (ingreso ? 'Detalle de la venta' : 'Detalle del gasto')}</b></div>
          <button className="d-close" onClick={onClose}>{I.close}</button>
        </div>
        <div className="d-body">
          <div className="d-title">{m.concepto}</div>
          <div className="d-sub">Transacción{m.ref ? ` #${m.ref}` : ''}</div>

          <div style={{ display: editing ? 'none' : 'block' }}>
          <div className="d-card">
            <div className="d-card-top">
              <div><div className="d-card-lbl">Valor total</div><div className="d-card-val">{money(m.valor)}</div></div>
              <span className="badge ok">Pagada</span>
            </div>
            <Row ico={I.cal} label="Fecha y hora" value={fmtLong(m.fecha)} />
            <Row ico={I.card} label="Método de pago" value={METODO[m.medio_pago] || m.medio_pago} />
            <Row ico={I.user} label={ingreso ? 'Cliente' : 'Proveedor'} value={m.cliente || '—'} />
            <Row ico={I.emp} label="Empleado" value={m.empleado || m.usuario || 'Vendedor'} />
            <Row ico={I.trend} label="Ganancia" value={ingreso ? (m.ganancia != null ? money(m.ganancia) : '—') : money(0)} red={!ingreso || m.ganancia === 0} />
          </div>

          {/* Recibo: ítems de la venta en pantalla */}
          {ingreso && det?.items?.length > 0 && (
            <div className="d-receipt">
              <div className="d-rec-h">{I.reg}<span>Recibo</span></div>
              {det.items.map((it, i) => (
                <div className="d-rec-row" key={i}>
                  <span className="d-rec-n">{it.qty} × {it.name}</span>
                  <b>{money(it.line_total)}</b>
                </div>
              ))}
              <div className="d-rec-tot"><span>Total</span><b>{money(m.valor)}</b></div>
            </div>
          )}
          </div>

          {editing && (
            <div className="d-card" style={{ textAlign: 'left', background: '#fff', border: '1px solid var(--bd)' }}>
              <label className="d-f-l">Descripción
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
              <label className="d-f-l">Monto
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </label>
              <label className="d-f-l">Método de pago
                <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                  <option value="EFECTIVO">Efectivo</option><option value="POS">Tarjeta</option><option value="TRANSFERENCIA">Transferencia</option>
                </select>
              </label>
              <label className="d-f-l">Categoría
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn" style={{ flex: 1 }} onClick={() => setEditing(false)}>Cancelar</button>
                <button className="btn btn-dark" style={{ flex: 1 }} onClick={saveEdit} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
              </div>
            </div>
          )}
        </div>
        <div className="d-foot">
          <button className="d-act" onClick={comprobante} disabled={printing}>{I.print}<span>Imprimir</span></button>
          <button className="d-act" onClick={comprobante} disabled={printing}>{I.doc}<span>{printing ? '…' : 'Comprobante'}</span></button>
          <button className="d-act" onClick={editar}>{I.edit}<span>Editar</span></button>
          <button className="d-act danger" onClick={eliminar} disabled={busy}>{I.trash}<span>{busy ? '…' : 'Eliminar'}</span></button>
        </div>
      </aside>
    </>
  );
}

function ClosureDrawer({ id, onClose, onVerTx, onChanged }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/reports/closures/${id}`).then(setD).catch((e) => setErr(e.message)); }, [id]);

  async function eliminarTurno() {
    if (!window.confirm('¿Eliminar este turno? Es una acción de gerencia, queda auditada y no se puede deshacer.')) return;
    setBusy(true);
    try { await api(`/reports/closures/${id}`, { method: 'DELETE' }); onChanged?.(); onClose(); }
    catch (e) { alert(e.message === 'PERMISO_DENEGADO' ? 'Solo gerencia puede eliminar turnos.' : e.message); setBusy(false); }
  }

  function imprimir() {
    if (!d) return;
    const vm = d.ventas_metodo, cj = d.caja;
    const totalIng = (vm.efectivo || 0) + (vm.tarjeta || 0) + (vm.transferencia || 0);
    const row = (l, v, o = {}) => `<tr class="${o.b ? 'b' : ''} ${o.red ? 'red' : ''}"><td>${l}</td><td class="r">${money(v)}</td></tr>`;
    const html = `<html><head><title>Arqueo de caja</title><style>
      @page{size:80mm auto;margin:3mm}
      body{font-family:Arial,Helvetica,sans-serif;color:#111;padding:6px;font-size:15px}
      h1{font-size:19px;margin:0 0 10px}
      .meta{font-size:14px;margin:0 0 14px;line-height:1.5}.meta b{font-weight:700}
      img{height:34px;float:right}
      table{width:100%;border-collapse:collapse}
      td{padding:7px 0;border-bottom:1px solid #eee}
      td.r{text-align:right}
      tr.head td{font-weight:800;border-bottom:2px solid #111}
      tr.b td{font-weight:800;font-size:16px;border-bottom:none}
      tr.red td{color:#c0392b}
    </style></head><body>
      <img src="${brandLogoUrl()}" onerror="this.style.display='none'"/>
      <h1>Arqueo de caja</h1>
      <div class="meta"><b>Apertura:</b> ${fmt(d.period_start)}, ${d.opener}<br><b>Cierre:</b> ${fmt(d.period_end)}, ${d.closer}</div>
      <table>
        <tr class="head"><td>Método de pago</td><td class="r">Monto</td></tr>
        ${row('Efectivo', vm.efectivo)}
        ${row('Tarjeta', vm.tarjeta)}
        ${vm.transferencia ? row('Transferencia', vm.transferencia) : ''}
        ${row('Total ingresos', totalIng, { b: true })}
        ${row('Dinero base', cj.dinero_base)}
        ${row('Ingresos en efectivo', cj.ingresos_efectivo)}
        ${row('Gastos en efectivo', cj.gastos_efectivo ? -cj.gastos_efectivo : 0)}
        ${row('Total Efectivo', cj.total_efectivo, { b: true })}
        ${row('Dinero contado en efectivo', cj.contado, { b: true })}
        ${row('Descuadre', d.resumen.descuadre, { b: true, red: d.has_descuadre })}
      </table>
      <div style="height:8mm"></div>
      <script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}</script>
    </body></html>`;
    openPrint(html);
  }
  const MRow = ({ label, v }) => <div className="cl-m"><span>{label}</span><b>{v}</b></div>;
  const SRow = ({ l, v, red, bold }) => <div className="d-row"><span className="d-row-l">{l}</span><span className={`d-row-v ${red ? 'v-red' : ''}`} style={bold ? { fontWeight: 900 } : undefined}>{v}</span></div>;

  return (
    <>
      <div className="d-overlay" onClick={onClose} />
      <aside className="drawer">
        <div className="d-head"><div className="d-head-l"><span className="d-ico">{I.cash}</span><b>Resumen del turno</b></div><button className="d-close" onClick={onClose}>{I.close}</button></div>
        <div className="d-body" style={{ textAlign: 'left' }}>
          {err ? <p className="v-red">{err}</p> : !d ? <Loading /> : (<>
            <div style={{ textAlign: 'right', marginBottom: 8 }}><button className="cl-del" onClick={eliminarTurno} disabled={busy}>{I.trash}<span>{busy ? '…' : 'Eliminar turno'}</span></button></div>
            <MRow label="Efectivo" v={money(d.declarado.efectivo)} />
            <MRow label="Tarjeta" v={money(d.declarado.tarjeta)} />
            <MRow label="Transferencia bancaria" v={money(d.declarado.transferencia)} />
            <MRow label="Otro" v={money(d.declarado.otro)} />
            <div className="d-card" style={{ marginTop: 4 }}>
              <div className="d-card-top">
                <div><div className="d-card-lbl">Dinero en efectivo</div><div className="d-card-val">{money(d.declarado.efectivo)}</div></div>
                {d.has_descuadre ? <span className="badge bad">Descuadre</span> : <span className="badge ok">Cuadrado</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: '.85rem' }} className={d.diff.efectivo === 0 ? 'muted' : (d.diff.efectivo > 0 ? 'v-dark' : 'v-red')}>
                {d.diff.efectivo === 0 ? 'Caja cuadrada ✅' : d.diff.efectivo > 0 ? `Te sobran ${money(d.diff.efectivo)} en efectivo.` : `Te faltan ${money(Math.abs(d.diff.efectivo))} en efectivo.`}
              </div>
            </div>
            <div className="d-card" style={{ marginTop: 12 }}>
              <div className="d-rec-h"><span>Detalle del turno</span></div>
              <SRow l="Apertura" v={`${fmt(d.period_start)} · ${d.opener}`} />
              <SRow l="Cierre" v={`${fmt(d.period_end)} · ${d.closer}`} />
              <SRow l="Total ventas" v={money(d.resumen.total_ventas)} />
              <SRow l="Total gastos" v={money(d.resumen.total_gastos)} />
              <SRow l="Descuadre" v={money(d.resumen.descuadre)} red={d.has_descuadre} />
              <SRow l="Balance" v={money(d.resumen.balance)} bold />
            </div>
          </>)}
        </div>
        <div className="d-foot" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="d-act" onClick={imprimir}>{I.print}<span>Imprimir</span></button>
          <button className="btn btn-dark" style={{ flex: 1, marginLeft: 10 }} onClick={() => d && onVerTx({ from: d.period_start, to: d.period_end })}>Ver detalle de transacciones</button>
        </div>
      </aside>
    </>
  );
}

const Loading = () => <div className="state">{[0, 1, 2, 3].map((i) => <div key={i} className="skel" style={{ opacity: 1 - i * 0.18 }} />)}</div>;
const Empty = ({ title, hint }) => <div className="state center"><div className="state-em">📭</div><div className="state-t">{title}</div><div className="state-h">{hint}</div></div>;
const ErrorBox = ({ msg, onRetry }) => <div className="state center"><div className="state-t" style={{ color: 'var(--danger)' }}>No se pudo cargar</div><div className="state-h">{msg}</div><button className="btn btn-dark" style={{ marginTop: 10 }} onClick={onRetry}>Reintentar</button></div>;

// Iconos de línea (compactos, reutilizados).
const svg = (p, vb = '0 0 24 24') => <svg viewBox={vb} width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{p}</svg>;
const I = {
  cash: svg(<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>),
  reg: svg(<><rect x="3" y="9" width="18" height="11" rx="1.5" /><path d="M5 9V5h9l5 4" /><path d="M8 13h2" /></>),
  trend: svg(<><path d="M3 17l6-6 4 4 7-7" /><path d="M14 8h6v6" /></>),
  filter: svg(<><path d="M4 5h16M7 12h10M10 19h4" /></>),
  search: svg(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>),
  download: svg(<><path d="M12 4v10m0 0l-4-4m4 4l4-4" /><path d="M4 20h16" /></>),
  chev: svg(<><path d="M6 9l6 6 6-6" /></>),
  cal: svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>),
  card: svg(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>),
  user: svg(<><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></>),
  emp: svg(<><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-5.5 7-5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M14 20c.5-2.5 2-3.5 4-3.5" /></>),
  close: svg(<><path d="M6 6l12 12M18 6L6 18" /></>),
  print: svg(<><path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" /><path d="M7 17h10v4H7z" /></>),
  doc: svg(<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 13h6M9 17h6" /></>),
  edit: svg(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 5l4 4" /></>),
  trash: svg(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>),
};

const CSS = `
/* PALETA POLLERÍA (negro/amarillo/rojo). Cambiar solo estas variables para rebrandear. */
.mov{--bg:#F7F7F5;--surface:#fff;--bd:#E5E5E5;--tx:#111111;--mut:#6B7280;--accent:#F5C400;--accent-h:#E0B200;--soft:#FFF3C4;--soft-r:#FBEAEA;--dark:#111111;--green:#16A34A;--danger:#C62828;--paid-bg:#E9F7EF;--paid-tx:#15803D;color:var(--tx);font-feature-settings:'tnum';max-width:72rem;margin:0 auto}
.mov svg{display:inline-block;vertical-align:-2px}
.mov .mov-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:10px;flex-wrap:wrap}
.mov h2{font-size:1.7rem;font-weight:800;color:#0f1b16}
.mov .btn{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--bd);background:var(--surface);color:var(--tx);padding:.55rem .9rem;border-radius:.7rem;font-weight:700;font-size:.85rem;cursor:pointer;transition:.15s;white-space:nowrap}
.mov .btn:hover{background:#fafafa}.mov .btn:active{transform:translateY(1px)}.mov .btn:disabled{opacity:.5}
.mov .btn-dark{background:var(--accent);border-color:var(--accent);color:#111}.mov .btn-dark:hover{background:var(--accent-h);border-color:var(--accent-h)}
.mov .btn-icon{padding:.55rem .65rem;color:var(--mut)}
.mov .seg{display:flex;gap:8px;background:#ECEEEC;border-radius:.8rem;padding:5px;margin-bottom:14px}
.mov .seg-b{flex:1;padding:.6rem;border:none;border-radius:.6rem;background:none;color:var(--mut);font-weight:800;font-size:.92rem;cursor:pointer;transition:.15s}
.mov .seg-b.on{background:var(--accent);color:#111;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.mov .filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.mov .select-wrap{position:relative}.mov .select-wrap svg{position:absolute;right:8px;top:50%;transform:translateY(-50%);color:var(--mut);pointer-events:none}
.mov select,.mov input{border:1px solid var(--bd);border-radius:.7rem;padding:.6rem .8rem;font-size:.85rem;background:var(--surface);color:var(--tx);font-weight:600}
.mov select{appearance:none;padding-right:30px;min-width:130px}
.mov input:focus,.mov select:focus{outline:2px solid var(--accent);outline-offset:-1px;border-color:var(--accent)}
.mov .input-ico{position:relative;display:flex;align-items:center}
.mov .input-ico>svg{position:absolute;left:10px;color:var(--mut)}
.mov .input-ico:has(>svg)>input{padding-left:32px}
.mov .input-ico.grow{flex:1;min-width:170px}.mov .input-ico.grow input{width:100%}
.mov .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px}
@media(max-width:640px){.mov .kpis{grid-template-columns:1fr}}
.mov .kpi{background:var(--surface);border:1px solid var(--bd);border-radius:1rem;padding:16px 18px;display:flex;align-items:center;gap:14px}
.mov .kpi-ico{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;flex-shrink:0}
.mov .kpi-ico.tint-g{background:var(--soft);color:#111}.mov .kpi-ico.tint-r{background:var(--soft-r);color:var(--danger)}
.mov .kpi-ico svg{width:20px;height:20px}
.mov .kpi-lbl{color:var(--mut);font-size:.82rem;font-weight:600}
.mov .kpi-val{font-size:1.55rem;font-weight:800;line-height:1.15}
.mov .v-dark{color:#0f1b16}.mov .v-green{color:var(--green)}.mov .v-red{color:var(--danger)}
.mov .subtabs{display:flex;gap:26px;border-bottom:1px solid var(--bd);margin-bottom:0;padding:0 6px}
.mov .subtab{background:none;border:none;padding:.7rem 0;color:var(--mut);font-weight:700;font-size:.9rem;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1px}
.mov .subtab:hover{color:var(--tx)}.mov .subtab.on{color:#111;border-color:var(--accent)}
.mov .card{background:var(--surface);border:1px solid var(--bd);border-top:none;border-radius:0 0 1rem 1rem;overflow-x:auto}
.mov table{width:100%;border-collapse:collapse;font-size:.88rem;min-width:640px}
.mov thead th{text-align:left;color:var(--mut);font-weight:600;padding:.8rem 1rem;border-bottom:1px solid var(--bd);background:#FBFBFB}
.mov th.r,.mov td.r{text-align:right}
.mov tbody td{padding:.7rem 1rem;border-bottom:1px solid #F1F2F1;vertical-align:middle}
.mov tbody tr:last-child td{border-bottom:none}
.mov tr.row{cursor:pointer;transition:.12s}.mov tr.row:hover{background:#F7FAF8}
.mov .concepto{display:flex;align-items:center;gap:12px}
.mov .chip{width:36px;height:36px;border-radius:.7rem;display:grid;place-items:center;flex-shrink:0}
.mov .chip-g{background:var(--soft);color:#111}.mov .chip-r{background:var(--soft-r);color:var(--danger)}
.mov .chip svg{width:18px;height:18px}
.mov .c-name{font-weight:600;color:#0f1b16}.mov .c-sub{font-size:.74rem;color:var(--mut)}
.mov .val{font-weight:800;white-space:nowrap}
.mov .muted{color:var(--mut)}.mov .nowrap{white-space:nowrap}
.mov .badge{padding:.2rem .6rem;border-radius:999px;font-size:.72rem;font-weight:800}
.mov .badge.ok{background:var(--paid-bg);color:var(--paid-tx)}.mov .badge.bad{background:var(--soft-r);color:var(--danger)}
.mov .note{color:var(--mut);font-size:.74rem;padding:6px 4px}
.mov .state{padding:18px}.mov .state.center{text-align:center;padding:40px 18px}
.mov .skel{height:16px;background:#EEF0EE;border-radius:7px;margin:14px 10px;animation:mp 1.2s infinite}
@keyframes mp{0%,100%{opacity:.4}50%{opacity:.85}}
.mov .state-em{font-size:30px}.mov .state-t{font-weight:800;color:#0f1b16;margin-top:6px}.mov .state-h{color:var(--mut);font-size:.84rem;margin-top:2px}
/* Drawer */
.mov .d-overlay{position:fixed;inset:0;background:rgba(15,27,22,.28);z-index:60}
.mov .drawer{position:fixed;top:0;right:0;height:100vh;width:min(430px,92vw);background:var(--surface);z-index:61;display:flex;flex-direction:column;box-shadow:-8px 0 30px rgba(0,0,0,.12);border-top:4px solid var(--accent);animation:slide .22s ease}
@keyframes slide{from{transform:translateX(100%)}to{transform:translateX(0)}}
.mov .d-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--bd)}
.mov .d-head-l{display:flex;align-items:center;gap:10px;font-size:1.05rem;color:#0f1b16}
.mov .d-ico{width:38px;height:38px;border-radius:50%;background:var(--soft);color:#111;display:grid;place-items:center}
.mov .d-close{width:30px;height:30px;border-radius:50%;background:#0f1b16;color:#fff;border:none;display:grid;place-items:center;cursor:pointer}
.mov .d-body{flex:1;overflow-y:auto;padding:22px 20px;text-align:center}
.mov .d-title{font-size:1.15rem;font-weight:800;color:#0f1b16}
.mov .d-sub{color:var(--mut);font-size:.84rem;margin-top:2px;margin-bottom:18px}
.mov .d-card{background:var(--soft);border-radius:1rem;padding:16px;text-align:left}
.mov .d-card-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px}
.mov .d-card-lbl{color:var(--mut);font-size:.82rem}.mov .d-card-val{font-size:1.5rem;font-weight:800;color:#0f1b16}
.mov .d-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-top:1px solid rgba(0,0,0,.06)}
.mov .d-row-l{display:flex;align-items:center;gap:9px;color:var(--mut);font-size:.86rem}
.mov .d-row-l svg{color:#111}
.mov .d-row-v{font-weight:700;color:#0f1b16;font-size:.86rem}
.mov .d-receipt{margin-top:16px;text-align:left;border:1px dashed var(--bd);border-radius:1rem;padding:14px 16px}
.mov .d-rec-h{display:flex;align-items:center;gap:8px;font-weight:800;color:#0f1b16;margin-bottom:8px;font-size:.9rem}
.mov .d-rec-h svg{color:#111}
.mov .d-rec-row{display:flex;justify-content:space-between;gap:10px;padding:5px 0;font-size:.85rem;color:#111;border-top:1px solid #F1F2F1}
.mov .d-rec-row:first-of-type{border-top:none}
.mov .d-rec-n{color:#374151}
.mov .d-rec-tot{display:flex;justify-content:space-between;border-top:2px solid #ECECEC;margin-top:6px;padding-top:8px;font-weight:800;color:#0f1b16}
.mov .d-f-l{display:block;font-size:.74rem;font-weight:700;color:var(--mut);margin-bottom:10px}
.mov .d-f-l input,.mov .d-f-l select{display:block;width:100%;margin-top:4px;font-weight:600}
.mov .cl-m{display:flex;justify-content:space-between;align-items:center;background:#fff;border:1px solid var(--bd);border-radius:.8rem;padding:12px 14px;margin-bottom:10px;font-weight:700;color:#111}
.mov .cl-del{display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #F3C9C9;color:var(--danger);font-weight:800;font-size:.78rem;padding:6px 12px;border-radius:.6rem;cursor:pointer}
.mov .cl-del:hover{background:var(--soft-r)}.mov .cl-del svg{width:15px;height:15px}
.mov .d-foot{display:flex;justify-content:space-around;padding:14px 10px;border-top:1px solid var(--bd);gap:6px}
.mov .d-act{display:flex;flex-direction:column;align-items:center;gap:5px;background:none;border:none;cursor:pointer;color:var(--tx);font-size:.72rem;font-weight:700}
.mov .d-act svg{width:20px;height:20px;color:#0f1b16;border:1.5px solid var(--bd);border-radius:50%;padding:8px;width:38px;height:38px}
.mov .d-act:hover svg{background:#fafafa}
.mov .d-act.danger{color:var(--danger)}.mov .d-act.danger svg{color:var(--danger);border-color:#F3C9C9}
`;
