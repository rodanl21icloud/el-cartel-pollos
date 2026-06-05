import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Spinner, ErrorState, EmptyState } from '../components/ui/States.jsx';

// ============================================================
// Centro de Operaciones Diario. 5 sub-vistas livianas: Hoy (dashboard),
// Apertura, Cierre, Inventario crítico y Tareas. Reutiliza datos reales del POS.
// ============================================================
const money = (n) => (n == null ? '—' : '$' + Number(n).toLocaleString('es-CL'));
const SEM = { verde: 'bg-emerald-500', amarillo: 'bg-amber-500', rojo: 'bg-cartel', gris: 'bg-slate-300' };
const SEM_TXT = { verde: 'text-emerald-600', amarillo: 'text-amber-600', rojo: 'text-cartel', gris: 'text-slate-400' };
const todayCl = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

const TABS = [
  { id: 'hoy', label: 'Hoy' }, { id: 'apertura', label: 'Apertura' },
  { id: 'cierre', label: 'Cierre' }, { id: 'inventario', label: 'Inventario' }, { id: 'tareas', label: 'Tareas' },
];

export default function CentroOperaciones() {
  const [tab, setTab] = useState('hoy');
  const day = todayCl();
  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div>
        <h2 className="font-black text-2xl mb-1">Centro de Operaciones</h2>
        <p className="text-ink-mute text-sm">Día {day}</p>
      </div>
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-card overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap ${tab === t.id ? 'bg-cartel text-white' : 'text-ink-mute'}`}>{t.label}</button>
        ))}
      </div>
      {tab === 'hoy' && <Dashboard day={day} onGoCierre={() => setTab('cierre')} />}
      {tab === 'apertura' && <Checklist day={day} phase="APERTURA" />}
      {tab === 'cierre' && <Checklist day={day} phase="CIERRE" />}
      {tab === 'inventario' && <Inventario day={day} />}
      {tab === 'tareas' && <Tareas day={day} />}
    </div>
  );
}

// ---------- HOY (Dashboard) ----------
function Dashboard({ day, onGoCierre }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');
  async function load() { setError(null); setD(null); try { setD(await api(`/ops/today?date=${day}`)); } catch (e) { setError(e); } }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [day]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!d) return <Spinner label="Cargando el día…" />;
  const k = d.kpis;

  async function act(fn, label) { setBusy(label); try { await fn(); await load(); } catch (e) { setError(e); } finally { setBusy(''); } }
  const abrir = () => act(() => api(`/ops/day/open?date=${day}`, { method: 'POST' }), 'abrir');
  const evaluar = () => act(() => api(`/ops/today/evaluate?date=${day}`, { method: 'POST' }), 'eval');
  const crearTarea = (titulo) => act(() => api('/ops/tasks', { method: 'POST', body: { title: titulo, priority: 'alta', day } }), 't');

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <button onClick={abrir} disabled={!!busy} className="px-3 py-2 rounded-xl bg-ink text-white font-bold text-sm">Marcar día abierto</button>
        <button onClick={evaluar} disabled={!!busy} className="px-3 py-2 rounded-xl bg-cartel text-white font-bold text-sm">{busy === 'eval' ? '…' : 'Evaluar alertas'}</button>
        <button onClick={onGoCierre} className="px-3 py-2 rounded-xl bg-slate-100 font-bold text-sm">Ir a cierre →</button>
      </div>

      {/* KPIs (máx 8) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Venta del día" value={money(k.ventas.value)} sem={k.ventas.semaforo} sub={k.ventas.pct_meta != null ? `${k.ventas.pct_meta}% de meta` : null} onTask={k.ventas.semaforo === 'rojo' ? () => crearTarea('Venta del día bajo meta') : null} />
        <Kpi label="Pedidos" value={k.pedidos.value} />
        <Kpi label="Ticket promedio" value={money(k.ticket.value)} sem={k.ticket.semaforo} onTask={k.ticket.semaforo === 'rojo' ? () => crearTarea('Ticket promedio bajo') : null} />
        <Kpi label="Food cost" value={k.food_cost.value == null ? '—' : k.food_cost.value + '%'} sem={k.food_cost.semaforo} onTask={k.food_cost.semaforo === 'rojo' ? () => crearTarea('Food cost alto') : null} />
        <Kpi label="Caja esperada" value={money(k.caja_esperada.value)} />
        <Kpi label="Caja real" value={money(k.caja_real.value)} />
        <Kpi label="Diferencia caja" value={money(k.caja_diferencia.value)} sem={k.caja_diferencia.semaforo} onTask={k.caja_diferencia.semaforo === 'rojo' ? () => crearTarea('Descuadre de caja') : null} />
        <Kpi label="Merma del día" value={money(k.merma.value)} sem={k.merma.semaforo} sub={`${k.merma.n} registro(s)`} onTask={k.merma.semaforo === 'rojo' ? () => crearTarea('Merma sobre umbral') : null} />
      </div>

      {/* Estados */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Status label="Inventario crítico" value={d.inventario_critico} tone={d.inventario_critico === 'OK' ? 'verde' : d.inventario_critico === 'RIESGO' ? 'amarillo' : 'rojo'} />
        <Status label="Apertura" value={lbl(d.apertura)} tone={d.apertura.startsWith('COMPLET') ? 'verde' : d.apertura.startsWith('PARC') ? 'amarillo' : 'gris'} />
        <Status label="Cierre" value={lbl(d.cierre)} tone={d.cierre.startsWith('COMPLET') ? 'verde' : d.cierre.startsWith('PARC') ? 'amarillo' : 'gris'} />
        <Status label="Alertas activas" value={d.alertas_activas} tone={d.alertas_activas ? 'rojo' : 'verde'} />
        <Status label="Tareas pend." value={d.tareas_pendientes} tone={d.tareas_vencidas ? 'rojo' : d.tareas_pendientes ? 'amarillo' : 'verde'} sub={d.tareas_vencidas ? `${d.tareas_vencidas} vencida(s)` : null} />
      </div>
      <p className="text-[11px] text-ink-mute">Labor %: {k.labor.nota}</p>
    </div>
  );
}
const lbl = (s) => ({ NO_INICIADA: 'No iniciada', PARCIAL: 'Parcial', COMPLETA: 'Completa', NO_INICIADO: 'No iniciado', COMPLETO: 'Completo' }[s] || s);

function Kpi({ label, value, sem, sub, onTask }) {
  return (
    <div className="card p-4 relative">
      {sem && <span className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${SEM[sem]}`} />}
      <div className="text-[11px] text-ink-mute font-bold">{label}</div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-ink-mute">{sub}</div>}
      {onTask && <button onClick={onTask} className="mt-1 text-[11px] font-bold text-cartel">+ Crear tarea</button>}
    </div>
  );
}
function Status({ label, value, tone, sub }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] text-ink-mute">{label}</div>
      <div className={`font-black ${SEM_TXT[tone]}`}>{value}</div>
      {sub && <div className="text-[10px] text-cartel">{sub}</div>}
    </div>
  );
}

// ---------- CHECKLIST (Apertura / Cierre) ----------
function Checklist({ day, phase }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  async function load() { setError(null); try { const r = await api(`/ops/checklist?date=${day}&phase=${phase}`); setItems(r.items); } catch (e) { setError(e); } }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [day, phase]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!items) return <Spinner label="Cargando checklist…" />;

  async function setItem(id, body) { try { const r = await api(`/ops/checklist/${id}`, { method: 'POST', body }); setItems(r.items); } catch (e) { setError(e); } }
  async function cerrar() {
    setMsg('');
    try { const r = await api(`/ops/day/close?date=${day}`, { method: 'POST', body: { notes } }); setMsg(r.ok ? '✅ Cierre registrado.' : ''); }
    catch (e) { setMsg(e.message === 'FALTA_CONTEO_INVENTARIO' ? '⚠️ Falta el conteo de inventario crítico para cerrar.' : e.message); }
  }
  const pend = items.filter((i) => i.is_critical && i.status === 'NO').length;

  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.id} className="card p-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="font-bold">{it.label} {it.is_critical ? <span className="text-[10px] text-cartel font-black">CRÍTICO</span> : null}</div>
            <div className="flex gap-1">
              {['SI', 'NO', 'NA'].map((s) => (
                <button key={s} onClick={() => setItem(it.id, { status: s, note: it.note || '' })}
                  className={`px-3 py-1 rounded-lg text-sm font-bold ${it.status === s ? (s === 'SI' ? 'bg-emerald-500 text-white' : s === 'NO' ? 'bg-cartel text-white' : 'bg-slate-400 text-white') : 'bg-slate-100 text-ink-mute'}`}>
                  {s === 'NA' ? 'N/A' : s === 'SI' ? 'Sí' : 'No'}
                </button>
              ))}
            </div>
          </div>
          <input defaultValue={it.note || ''} onBlur={(e) => e.target.value !== (it.note || '') && setItem(it.id, { status: it.status, note: e.target.value })}
            placeholder="Observación…" className="mt-2 w-full text-sm px-2 py-1.5 rounded-lg border-2 border-slate-200" />
        </div>
      ))}
      {phase === 'CIERRE' && (
        <div className="card p-3 space-y-2">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observación general del cierre…" className="w-full text-sm px-2 py-1.5 rounded-lg border-2 border-slate-200" />
          {pend > 0 && <p className="text-cartel text-sm font-bold">Hay {pend} ítem(s) crítico(s) en NO — genera tareas correctivas.</p>}
          <button onClick={cerrar} className="px-4 py-2.5 rounded-xl bg-cartel text-white font-black">Registrar cierre</button>
          {msg && <p className="text-sm font-bold mt-1">{msg}</p>}
        </div>
      )}
    </div>
  );
}

// ---------- INVENTARIO CRÍTICO + MERMA ----------
const MOTIVOS = ['Sobreproducción', 'Error de preparación', 'Caída/derrame', 'Vencimiento', 'Devolución', 'Otro'];
function Inventario({ day }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ ingredient_id: '', qty: '', reason: MOTIVOS[0] });
  const [msg, setMsg] = useState('');
  async function load() { setError(null); try { setD(await api('/ops/critical-inventory')); } catch (e) { setError(e); } }
  useEffect(() => { load(); }, []);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!d) return <Spinner label="Cargando inventario crítico…" />;

  async function registrarMerma() {
    setMsg('');
    if (!form.ingredient_id || !(Number(form.qty) > 0)) { setMsg('Elige insumo y cantidad.'); return; }
    try {
      await api('/inventory/merma', { method: 'POST', body: { ingredient_id: form.ingredient_id, qty: Number(form.qty), reason: form.reason } });
      setMsg('✅ Merma registrada.'); setForm({ ingredient_id: '', qty: '', reason: MOTIVOS[0] }); load();
    } catch (e) { setMsg(e.message === 'PERMISO_DENEGADO' ? 'Sin permiso para registrar merma.' : e.message); }
  }
  const TONE = { OK: 'text-emerald-600', RIESGO: 'text-amber-600', CRITICO: 'text-cartel' };

  return (
    <div className="space-y-4">
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-mute border-b"><th className="py-2 px-3">Insumo</th><th className="text-right">Stock</th><th className="text-right">Mínimo</th><th>Estado</th></tr></thead>
          <tbody>
            {d.items.map((i) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="py-2 px-3 font-semibold">{i.name}</td>
                <td className="text-right tabular-nums">{i.stock_qty} {i.unit}</td>
                <td className="text-right tabular-nums text-ink-mute">{i.min_stock_qty}</td>
                <td className={`font-bold ${TONE[i.estado]}`}>{i.estado === 'OK' ? '🟢 OK' : i.estado === 'RIESGO' ? '🟡 Riesgo' : '🔴 Crítico'}</td>
              </tr>
            ))}
            {!d.items.length && <tr><td colSpan="4"><EmptyState icon="📦" title="Sin insumos críticos" hint="Marca insumos como críticos en Inventario." /></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card p-4 space-y-2">
        <h3 className="font-black">Registrar merma</h3>
        <div className="flex gap-2 flex-wrap items-end">
          <select value={form.ingredient_id} onChange={(e) => setForm({ ...form, ingredient_id: e.target.value })} className="px-2 py-2 rounded-lg border-2 border-slate-200 text-sm">
            <option value="">Insumo…</option>
            {d.items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
          </select>
          <input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="Cantidad" className="w-28 px-2 py-2 rounded-lg border-2 border-slate-200 text-sm" />
          <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="px-2 py-2 rounded-lg border-2 border-slate-200 text-sm">
            {MOTIVOS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <button onClick={registrarMerma} className="px-4 py-2 rounded-xl bg-cartel text-white font-black">Registrar</button>
        </div>
        {msg && <p className="text-sm font-bold">{msg}</p>}
      </div>
    </div>
  );
}

// ---------- TAREAS / ALERTAS ----------
function Tareas({ day }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [nt, setNt] = useState({ title: '', priority: 'media' });
  async function load() { setError(null); try { setList(await api(`/ops/tasks?date=${day}`)); } catch (e) { setError(e); } }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [day]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!list) return <Spinner label="Cargando tareas…" />;

  async function upd(id, body) { try { await api(`/ops/tasks/${id}`, { method: 'PATCH', body }); load(); } catch (e) { setError(e); } }
  async function crear() { if (!nt.title.trim()) return; try { await api('/ops/tasks', { method: 'POST', body: { ...nt, day } }); setNt({ title: '', priority: 'media' }); load(); } catch (e) { setError(e); } }
  const PRIO = { alta: 'bg-cartel text-white', media: 'bg-amber-100 text-amber-700', baja: 'bg-slate-100 text-slate-600' };

  return (
    <div className="space-y-3">
      <div className="card p-3 flex gap-2 flex-wrap items-end">
        <input value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} placeholder="Nueva tarea…" className="flex-1 min-w-[160px] px-2 py-2 rounded-lg border-2 border-slate-200 text-sm" />
        <select value={nt.priority} onChange={(e) => setNt({ ...nt, priority: e.target.value })} className="px-2 py-2 rounded-lg border-2 border-slate-200 text-sm font-bold">
          <option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option>
        </select>
        <button onClick={crear} className="px-4 py-2 rounded-xl bg-cartel text-white font-black">Agregar</button>
      </div>

      {list.length === 0 && <EmptyState icon="✅" title="Sin tareas ni alertas" hint="El día está al día. Usa 'Evaluar alertas' en Hoy para detectar desviaciones." />}
      {list.map((t) => (
        <div key={t.id} className={`card p-3 ${t.overdue ? 'border-l-4 border-cartel' : ''} ${['resuelta', 'descartada'].includes(t.status) ? 'opacity-60' : ''}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${PRIO[t.priority]}`}>{t.priority.toUpperCase()}</span>
              {t.kind === 'ALERTA' && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700 ml-1">ALERTA</span>}
              {t.overdue && <span className="text-[10px] font-black text-cartel ml-1">VENCIDA</span>}
              <span className="font-bold ml-2">{t.title}</span>
            </div>
            <select value={t.status} onChange={(e) => upd(t.id, { status: e.target.value })} className="px-2 py-1 rounded-lg border-2 border-slate-200 text-xs font-bold">
              <option value="pendiente">Pendiente</option><option value="en_proceso">En proceso</option><option value="resuelta">Resuelta</option><option value="descartada">Descartada</option>
            </select>
          </div>
          {(t.impact || t.suggested_action) && <div className="text-xs text-ink-mute mt-1">{t.impact}{t.suggested_action ? ` · ${t.suggested_action}` : ''}</div>}
        </div>
      ))}
    </div>
  );
}
