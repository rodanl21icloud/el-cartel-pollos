import { useEffect, useState } from 'react';
import { api, apiDownload } from '../lib/api.js';

// ============================================================
// Módulo "Movimientos" — libro unificado de ingresos (ventas) y egresos (gastos)
// + cierres de caja. Re-skin pollería (negro/amarillo/rojo) scopeado a .mov.
// Dos modos: standalone (módulo completo con acciones y filtros) y embebido
// en Finanzas (recibe `period`, oculta barra de acciones).
// ============================================================
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const METODO = { EFECTIVO: 'Efectivo', POS: 'Tarjeta', TRANSFERENCIA: 'Transferencia' };
const fmt = (iso) => { try { return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };

function rangeOf(mode, anchor) {
  const d = anchor ? new Date(anchor + 'T00:00:00') : new Date(); d.setHours(0, 0, 0, 0);
  let from = new Date(d), to = new Date(d); to.setHours(23, 59, 59, 999);
  if (mode === 'Semanal') { from.setDate(d.getDate() - ((d.getDay() + 6) % 7)); to = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999); }
  else if (mode === 'Mensual') { from.setDate(1); to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
  return { from: from.toISOString(), to: to.toISOString() };
}

const QF = [['', 'Todos'], ['INGRESO', 'Ingresos'], ['EGRESO', 'Egresos'], ['COBRAR', 'Por cobrar'], ['PAGAR', 'Por pagar']];

export default function Movimientos({ period: extPeriod, onGo } = {}) {
  const embedded = !!extPeriod;
  const [mode, setMode] = useState('Diario');
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const period = extPeriod || rangeOf(mode, anchor);
  const [topTab, setTopTab] = useState('tx');     // tx | cierres
  const [qf, setQf] = useState('');               // '' | INGRESO | EGRESO | COBRAR | PAGAR
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [closures, setClosures] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);

  const noImpl = qf === 'COBRAR' || qf === 'PAGAR'; // el negocio es contado: no hay cuentas por cobrar/pagar

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

  async function descargar() {
    setDownloading(true);
    try {
      const tipo = qf === 'INGRESO' ? 'ventas' : 'movimientos';
      await apiDownload(`/reports/export?type=${tipo}&from=${period.from}&to=${period.to}`, `${tipo}_${period.from.slice(0, 10)}.csv`);
    } catch (e) { setError(e.message); } finally { setDownloading(false); }
  }

  const k = data?.kpis;

  return (
    <div className="mov max-w-5xl mx-auto">
      <style>{CSS}</style>

      {/* Encabezado + acciones rápidas (solo standalone) */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-2xl font-black">Movimientos</h2>
        {!embedded && (
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-am" onClick={() => onGo?.('cash')}>＋ Abrir caja</button>
            <button className="btn" onClick={() => onGo?.('pos')}>Nueva venta ▾</button>
            <button className="btn" onClick={() => onGo?.('gastos')}>＋ Nuevo gasto</button>
          </div>
        )}
      </div>

      {/* Tabs del módulo */}
      <div className="flex gap-1 border-b mb-3" style={{ borderColor: '#E5E5E5' }}>
        <button className={`tab ${topTab === 'tx' ? 'on' : ''}`} onClick={() => setTopTab('tx')}>Transacciones</button>
        <button className={`tab ${topTab === 'cierres' ? 'on' : ''}`} onClick={() => setTopTab('cierres')}>Cierres de caja</button>
      </div>

      {topTab === 'tx' && (
        <>
          {/* Barra de filtros */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <button className="btn" onClick={loadTx}>⛃ Filtrar</button>
            {!embedded && (
              <>
                <select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option>Diario</option><option>Semanal</option><option>Mensual</option>
                </select>
                <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
              </>
            )}
            <input className="flex-1 min-w-[160px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar concepto..." />
            <button className="btn btn-dark" onClick={descargar} disabled={downloading}>⤓ {downloading ? 'Generando…' : 'Descargar reporte'}</button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <Kpi label="Balance" value={money(k?.balance)} tone={k && k.balance < 0 ? 'neg' : 'am'} />
            <Kpi label="Ventas totales" value={money(k?.ventas?.total)} sub={`${k?.ventas?.n || 0} ventas`} tone="white" />
            <Kpi label="Gastos totales" value={money(k?.gastos?.total)} sub={`${k?.gastos?.n || 0} gastos`} tone="neg" />
          </div>

          {/* Quick filters */}
          <div className="flex gap-2 flex-wrap mb-3">
            {QF.map(([id, label]) => (
              <button key={id} className={`chip ${qf === id ? 'on' : ''}`} onClick={() => setQf(id)}>{label}</button>
            ))}
          </div>

          {/* Tabla / estados */}
          <div className="card overflow-x-auto">
            {error ? <ErrorBox msg={error} onRetry={loadTx} />
              : !data ? <Loading />
                : data._noimpl ? <Empty title="Sin cuentas pendientes" hint="Tu negocio opera al contado: no hay cuentas por cobrar/pagar registradas." />
                  : !data.items.length ? <Empty title="Sin movimientos en el período" hint="Cambia el período, el filtro o registra una venta o gasto." />
                    : (
                      <table className="min-w-[640px]">
                        <thead><tr><th>Concepto</th><th style={{ textAlign: 'right' }}>Valor</th><th>Medio de pago</th><th>Fecha y hora</th></tr></thead>
                        <tbody>
                          {data.items.map((m) => {
                            const bad = m.tipo === 'EGRESO' || /descuadre|merma/i.test(m.concepto || '');
                            return (
                              <tr key={m.id}>
                                <td><div className="font-semibold" style={{ color: '#111' }}>{m.concepto}</div>{m.categoria && <div style={{ color: '#6B7280', fontSize: '.72rem' }}>{m.categoria}</div>}</td>
                                <td style={{ textAlign: 'right' }} className={m.tipo === 'INGRESO' ? 'pos' : 'neg'}>{m.tipo === 'INGRESO' ? '+' : '−'}{money(m.valor)}</td>
                                <td style={{ color: '#374151' }}>{METODO[m.medio_pago] || m.medio_pago}</td>
                                <td style={{ color: '#6B7280', whiteSpace: 'nowrap' }}>{fmt(m.fecha)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
          </div>
          {data?.truncated && <p style={{ color: '#6B7280', fontSize: '.72rem' }} className="px-2 mt-1">Mostrando los más recientes. Acota el período o descarga el reporte completo.</p>}
        </>
      )}

      {topTab === 'cierres' && (
        <div className="card overflow-x-auto">
          {error ? <ErrorBox msg={error} onRetry={loadCierres} />
            : !closures ? <Loading />
              : !closures.length ? <Empty title="Sin cierres de caja" hint="Los cierres aparecerán aquí al cerrar la caja del turno." />
                : (
                  <table className="min-w-[640px]">
                    <thead><tr><th>Período</th><th style={{ textAlign: 'right' }}>Fondo inicial</th><th style={{ textAlign: 'right' }}>Diferencia</th><th>Estado</th><th>Fecha</th></tr></thead>
                    <tbody>
                      {closures.map((c) => (
                        <tr key={c.id}>
                          <td style={{ color: '#111', whiteSpace: 'nowrap' }}>{fmt(c.period_start)} → {fmt(c.period_end)}</td>
                          <td style={{ textAlign: 'right', color: '#374151' }}>{money(c.opening_float)}</td>
                          <td style={{ textAlign: 'right' }} className={c.has_descuadre ? 'neg' : 'pos'}>{money(c.diff_total)}</td>
                          <td>{c.has_descuadre ? <span className="badge-bad">Descuadre</span> : <span className="badge-ok">Cuadrado</span>}</td>
                          <td style={{ color: '#6B7280', whiteSpace: 'nowrap' }}>{fmt(c.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone }) {
  const color = tone === 'neg' ? '#FF6B6B' : tone === 'am' ? '#F5C400' : '#fff';
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="val" style={{ color }}>{value}</div>
      {sub && <div style={{ color: '#bdbdbd', fontSize: '.72rem' }}>{sub}</div>}
    </div>
  );
}
const Loading = () => (
  <div style={{ padding: '1rem' }}>
    {[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 14, background: '#eee', borderRadius: 6, margin: '12px 8px', animation: 'mp 1.2s infinite', opacity: 1 - i * 0.15 }} />)}
  </div>
);
const Empty = ({ title, hint }) => (
  <div style={{ padding: '2rem', textAlign: 'center' }}>
    <div style={{ fontSize: 28 }}>🍗</div>
    <div style={{ fontWeight: 800, color: '#111', marginTop: 4 }}>{title}</div>
    <div style={{ color: '#6B7280', fontSize: '.82rem' }}>{hint}</div>
  </div>
);
const ErrorBox = ({ msg, onRetry }) => (
  <div style={{ padding: '1.5rem', textAlign: 'center' }}>
    <div style={{ color: '#C62828', fontWeight: 800 }}>No se pudo cargar</div>
    <div style={{ color: '#6B7280', fontSize: '.82rem', margin: '.25rem 0 .75rem' }}>{msg}</div>
    <button className="btn btn-am" onClick={onRetry}>Reintentar</button>
  </div>
);

const CSS = `
.mov{--negro:#111111;--negro2:#1A1A1A;--am:#F5C400;--amh:#E0B200;--rojo:#C62828;--bd:#E5E5E5;--g2:#6B7280;color:#111;font-feature-settings:'tnum';}
.mov h2{color:var(--negro);letter-spacing:-.01em}
.mov .btn{border:1px solid var(--bd);background:#fff;color:var(--negro);padding:.5rem .9rem;border-radius:.6rem;font-weight:700;font-size:.85rem;cursor:pointer;transition:.15s;white-space:nowrap}
.mov .btn:hover{background:#fafafa}
.mov .btn:active{transform:translateY(1px)}
.mov .btn:disabled{opacity:.5;cursor:default}
.mov .btn-am{background:var(--am);border-color:var(--am);color:var(--negro)}
.mov .btn-am:hover{background:var(--amh);border-color:var(--amh)}
.mov .btn-dark{background:var(--negro);border-color:var(--negro);color:#fff}
.mov .btn-dark:hover{background:var(--negro2)}
.mov .chip{padding:.35rem .85rem;border-radius:999px;border:1px solid var(--bd);background:#fff;color:var(--g2);font-weight:700;font-size:.8rem;cursor:pointer;transition:.15s}
.mov .chip:hover{border-color:var(--am)}
.mov .chip.on{background:var(--am);border-color:var(--am);color:var(--negro)}
.mov .tab{padding:.55rem .9rem;font-weight:800;color:var(--g2);background:none;border:none;border-bottom:3px solid transparent;margin-bottom:-1px;cursor:pointer}
.mov .tab:hover{color:var(--negro)}
.mov .tab.on{color:var(--negro);border-color:var(--am)}
.mov .card{background:#fff;border:1px solid var(--bd);border-radius:.9rem;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.mov input,.mov select{border:1px solid var(--bd);border-radius:.6rem;padding:.5rem .7rem;font-size:.85rem;background:#fff;color:var(--negro)}
.mov input:focus,.mov select:focus{outline:2px solid var(--am);outline-offset:-1px;border-color:var(--am)}
.mov table{width:100%;border-collapse:collapse;font-size:.85rem}
.mov thead th{text-align:left;color:var(--g2);font-weight:700;padding:.6rem .75rem;border-bottom:1px solid var(--bd);background:#fafafa;white-space:nowrap}
.mov tbody td{padding:.6rem .75rem;border-bottom:1px solid var(--bd);vertical-align:middle}
.mov tbody tr:last-child td{border-bottom:none}
.mov tbody tr:hover{background:#fcfbf3}
.mov .pos{color:var(--negro);font-weight:800;white-space:nowrap}
.mov .neg{color:var(--rojo);font-weight:800;white-space:nowrap}
.mov .badge-bad{background:#fde8e8;color:var(--rojo);font-weight:800;padding:.12rem .55rem;border-radius:999px;font-size:.7rem}
.mov .badge-ok{background:#eafaf0;color:#166534;font-weight:800;padding:.12rem .55rem;border-radius:999px;font-size:.7rem}
.mov .kpi{background:var(--negro);border-radius:.9rem;padding:1rem 1.1rem;border:1px solid var(--negro)}
.mov .kpi .lbl{color:#bdbdbd;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;font-weight:700}
.mov .kpi .val{font-size:1.6rem;font-weight:900;line-height:1.2}
@keyframes mp{0%,100%{opacity:.4}50%{opacity:.9}}
`;
