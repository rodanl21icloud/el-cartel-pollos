import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import PeriodNav from '../components/PeriodNav.jsx';
import { Spinner, ErrorState, EmptyState } from '../components/ui/States.jsx';
import { KpiCard, Badge } from '../components/ui/kit.jsx';

// ============================================================
// Módulo Comercial / Marketing. Hub con sub-tabs (mismo patrón que Finanzas).
// Reutiliza datos reales: clients, sales, sale_items, products.
// ============================================================
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const fecha = (iso) => { try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }); } catch { return '—'; } };

const TABS = [
  { id: 'dashboard', label: 'Dashboard' }, { id: 'clientes', label: 'Clientes' },
  { id: 'campanas', label: 'Campañas' }, { id: 'loyalty', label: 'Loyalty' }, { id: 'reportes', label: 'Reportes' },
];
const PERIOD_TABS = new Set(['dashboard', 'reportes']);

export default function Comercial() {
  const [tab, setTab] = useState('dashboard');
  const [period, setPeriod] = useState(null);
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-black text-2xl mb-2">Comercial</h2>
          <div className="flex gap-1 bg-white rounded-xl p-1 shadow-card overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap ${tab === t.id ? 'bg-cartel text-white' : 'text-ink-mute'}`}>{t.label}</button>
            ))}
          </div>
        </div>
        {PERIOD_TABS.has(tab) && <PeriodNav onChange={setPeriod} />}
      </div>

      {tab === 'dashboard' && period && <Dashboard period={period} />}
      {tab === 'clientes' && <Clientes />}
      {tab === 'campanas' && <Campanas />}
      {tab === 'loyalty' && <Loyalty />}
      {tab === 'reportes' && period && <Reportes period={period} />}
    </div>
  );
}

// ---------- DASHBOARD COMERCIAL ----------
function Dashboard({ period }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const qs = `from=${encodeURIComponent(period.from)}&to=${encodeURIComponent(period.to)}`;
  async function load() { setError(null); setD(null); try { setD(await api(`/marketing/dashboard?${qs}`)); } catch (e) { setError(e); } }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period.from, period.to]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!d) return <Spinner label="Cargando dashboard comercial…" />;
  const k = d.kpis;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Ventas (revenue)" value={money(k.revenue)} big />
        <KpiCard label="Pedidos" value={k.orders} />
        <KpiCard label="Ticket promedio" value={money(k.avg_order_value)} />
        <KpiCard label="Frecuencia compra" value={k.purchase_frequency + '×'} hint="pedidos / cliente" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Clientes únicos" value={k.unique_customers} />
        <KpiCard label="Clientes nuevos" value={k.new_customers} />
        <KpiCard label="Recurrentes" value={k.repeat_customers} />
        <KpiCard label="Dormidos" value={k.dormant_customers} alert={k.dormant_customers > 0} hint=">45 días sin comprar" />
      </div>
      <div className="card p-3 flex items-center gap-3">
        <Badge tone={k.active_campaigns ? 'ok' : 'neutral'}>{k.active_campaigns} campaña(s) activa(s)</Badge>
        <span className="text-xs text-ink-mute">{d.notes[0]}</span>
      </div>
    </div>
  );
}

// ---------- CLIENTES / SEGMENTACIÓN ----------
const SEG = { vip: { t: 'ok', l: 'VIP' }, frecuente: { t: 'ok', l: 'Frecuente' }, nuevo: { t: 'warn', l: 'Nuevo' }, ocasional: { t: 'neutral', l: 'Ocasional' }, dormido: { t: 'bad', l: 'Dormido' }, sin_compras: { t: 'neutral', l: 'Sin compras' } };
function Clientes() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [seg, setSeg] = useState('');
  async function load() { setError(null); setD(null); try { setD(await api(`/marketing/customers${seg ? `?segment=${seg}` : ''}`)); } catch (e) { setError(e); } }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [seg]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!d) return <Spinner label="Segmentando clientes…" />;
  return (
    <div className="space-y-3">
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-card w-fit flex-wrap">
        <button onClick={() => setSeg('')} className={`px-3 py-1.5 rounded-lg font-bold text-sm ${!seg ? 'bg-cartel text-white' : 'text-ink-mute'}`}>Todos</button>
        {Object.entries(d.counts).map(([s, n]) => (
          <button key={s} onClick={() => setSeg(s)} className={`px-3 py-1.5 rounded-lg font-bold text-sm ${seg === s ? 'bg-cartel text-white' : 'text-ink-mute'}`}>{SEG[s]?.l || s} ({n})</button>
        ))}
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead><tr className="text-left text-ink-mute border-b"><th className="py-2 px-3">Cliente</th><th className="text-right">Pedidos</th><th className="text-right">Gastado</th><th className="text-right">Ticket</th><th className="text-right">Última</th><th>Segmento</th></tr></thead>
          <tbody>
            {d.customers.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="py-2 px-3 font-semibold">{c.name}<div className="text-[11px] text-ink-mute">{c.phone}</div></td>
                <td className="text-right tabular-nums">{c.n_orders}</td>
                <td className="text-right tabular-nums">{money(c.total_spent)}</td>
                <td className="text-right tabular-nums">{money(c.aov)}</td>
                <td className="text-right text-ink-mute">{c.last_order ? `${fecha(c.last_order)} (${c.recency_days}d)` : '—'}</td>
                <td><Badge tone={SEG[c.segment]?.t}>{SEG[c.segment]?.l || c.segment}</Badge></td>
              </tr>
            ))}
            {!d.customers.length && <tr><td colSpan="6"><EmptyState icon="👥" title="Sin clientes en este segmento" hint="Los clientes se crean al registrar domicilios en el POS." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- CAMPAÑAS ----------
const CAMP_STATUS = { borrador: 'neutral', activa: 'ok', pausada: 'warn', finalizada: 'neutral' };
function Campanas() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', channel: 'WHATSAPP', segment: 'todos', discount_type: 'PORCENTAJE', discount_value: '', status: 'borrador' });
  async function load() { setError(null); try { setList(await api('/marketing/campaigns')); } catch (e) { setError(e); } }
  useEffect(() => { load(); }, []);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!list) return <Spinner label="Cargando campañas…" />;

  async function crear() {
    if (!form.name.trim()) return;
    try { await api('/marketing/campaigns', { method: 'POST', body: { ...form, discount_value: Number(form.discount_value) || 0 } }); setForm({ ...form, name: '', discount_value: '' }); load(); }
    catch (e) { setError(e); }
  }
  async function setStatus(id, status) { try { await api(`/marketing/campaigns/${id}`, { method: 'PATCH', body: { status } }); load(); } catch (e) { setError(e); } }

  return (
    <div className="space-y-3">
      <div className="card p-4 grid md:grid-cols-2 gap-2">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre de la campaña" className="px-2 py-2 rounded-lg border-2 border-slate-200 text-sm md:col-span-2" />
        <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="px-2 py-2 rounded-lg border-2 border-slate-200 text-sm">
          <option value="WHATSAPP">WhatsApp</option><option value="LOCAL">En local</option><option value="REDES">Redes</option><option value="OTRO">Otro</option>
        </select>
        <select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} className="px-2 py-2 rounded-lg border-2 border-slate-200 text-sm">
          {['todos', 'vip', 'frecuente', 'nuevo', 'ocasional', 'dormido'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })} className="px-2 py-2 rounded-lg border-2 border-slate-200 text-sm">
          {['PORCENTAJE', 'MONTO', '2X1', 'COMBO', 'NINGUNO'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} placeholder="Valor descuento" className="px-2 py-2 rounded-lg border-2 border-slate-200 text-sm" />
        <button onClick={crear} className="px-4 py-2 rounded-xl bg-cartel text-white font-black md:col-span-2">Crear campaña</button>
      </div>

      {list.map((c) => (
        <div key={c.id} className="card p-3 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <span className="font-bold">{c.name}</span>
            <div className="text-xs text-ink-mute">{c.channel} · {c.segment} · {c.discount_type !== 'NINGUNO' ? `${c.discount_type} ${c.discount_value}` : 'sin descuento'}</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={CAMP_STATUS[c.status]}>{c.status}</Badge>
            <select value={c.status} onChange={(e) => setStatus(c.id, e.target.value)} className="px-2 py-1 rounded-lg border-2 border-slate-200 text-xs font-bold">
              {['borrador', 'activa', 'pausada', 'finalizada'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      ))}
      {!list.length && <EmptyState icon="📣" title="Sin campañas" hint="Crea tu primera promoción arriba." />}
    </div>
  );
}

// ---------- LOYALTY ----------
function Loyalty() {
  const [d, setD] = useState(null);
  const [cust, setCust] = useState([]);
  const [error, setError] = useState(null);
  const [mv, setMv] = useState({ clientId: '', type: 'EARN', points: '', reason: '' });
  async function load() {
    setError(null);
    try { const [l, c] = await Promise.all([api('/marketing/loyalty'), api('/marketing/customers')]); setD(l); setCust(c.customers); }
    catch (e) { setError(e); }
  }
  useEffect(() => { load(); }, []);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!d) return <Spinner label="Cargando fidelización…" />;

  async function mover() {
    if (!mv.clientId || !(Number(mv.points) > 0)) return;
    try { await api(`/marketing/loyalty/${mv.clientId}`, { method: 'POST', body: { type: mv.type, points: Number(mv.points), reason: mv.reason } }); setMv({ ...mv, points: '', reason: '' }); load(); }
    catch (e) { setError(e); }
  }
  const TIER = { BRONCE: 'neutral', PLATA: 'ok', ORO: 'warn' };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Miembros" value={d.miembros} />
        <KpiCard label="Puntos en circulación" value={d.puntos_totales} />
      </div>
      <div className="card p-4 flex gap-2 flex-wrap items-end">
        <select value={mv.clientId} onChange={(e) => setMv({ ...mv, clientId: e.target.value })} className="px-2 py-2 rounded-lg border-2 border-slate-200 text-sm min-w-[160px]">
          <option value="">Cliente…</option>
          {cust.map((c) => <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>)}
        </select>
        <select value={mv.type} onChange={(e) => setMv({ ...mv, type: e.target.value })} className="px-2 py-2 rounded-lg border-2 border-slate-200 text-sm font-bold">
          <option value="EARN">Sumar</option><option value="REDEEM">Canjear</option><option value="ADJUST">Ajustar</option>
        </select>
        <input type="number" value={mv.points} onChange={(e) => setMv({ ...mv, points: e.target.value })} placeholder="Puntos" className="w-24 px-2 py-2 rounded-lg border-2 border-slate-200 text-sm" />
        <input value={mv.reason} onChange={(e) => setMv({ ...mv, reason: e.target.value })} placeholder="Motivo" className="flex-1 min-w-[120px] px-2 py-2 rounded-lg border-2 border-slate-200 text-sm" />
        <button onClick={mover} className="px-4 py-2 rounded-xl bg-cartel text-white font-black">Aplicar</button>
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-ink-mute border-b"><th className="py-2 px-3">Cliente</th><th className="text-right">Puntos</th><th>Tier</th></tr></thead>
          <tbody>
            {d.cuentas.map((c) => (
              <tr key={c.client_id} className="border-b last:border-0">
                <td className="py-2 px-3 font-semibold">{c.name}<div className="text-[11px] text-ink-mute">{c.phone}</div></td>
                <td className="text-right tabular-nums font-black">{c.points}</td>
                <td><Badge tone={TIER[c.tier]}>{c.tier}</Badge></td>
              </tr>
            ))}
            {!d.cuentas.length && <tr><td colSpan="3"><EmptyState icon="⭐" title="Sin cuentas de fidelización" hint="Suma puntos a un cliente para empezar." /></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- REPORTES ----------
function Reportes({ period }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const qs = `from=${encodeURIComponent(period.from)}&to=${encodeURIComponent(period.to)}`;
  async function load() { setError(null); setD(null); try { setD(await api(`/marketing/reports?${qs}`)); } catch (e) { setError(e); } }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period.from, period.to]);
  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!d) return <Spinner label="Generando reportes…" />;
  const maxT = Math.max(1, ...d.top_products.map((p) => p.total));
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="card p-4">
        <h3 className="font-black mb-3">Top productos (período)</h3>
        <ul className="space-y-2">
          {d.top_products.map((p) => (
            <li key={p.name}>
              <div className="flex justify-between text-sm"><span className="font-semibold truncate pr-2">{p.name}</span><span className="text-ink-mute whitespace-nowrap">{p.unidades}u · {money(p.total)}</span></div>
              <div className="h-1.5 bg-slate-100 rounded-full mt-0.5"><div className="h-1.5 bg-cartel rounded-full" style={{ width: `${(p.total / maxT) * 100}%` }} /></div>
            </li>
          ))}
          {!d.top_products.length && <li className="text-ink-mute text-sm">Sin ventas en el período.</li>}
        </ul>
      </div>
      <div className="card p-4">
        <h3 className="font-black mb-3">Mix de segmentos de clientes</h3>
        <ul className="space-y-1 text-sm">
          {Object.entries(d.segment_mix).map(([s, n]) => (
            <li key={s} className="flex justify-between"><span><Badge tone={SEG[s]?.t}>{SEG[s]?.l || s}</Badge></span><span className="font-bold tabular-nums">{n}</span></li>
          ))}
          {!Object.keys(d.segment_mix).length && <li className="text-ink-mute">Aún no hay clientes registrados.</li>}
        </ul>
        <p className="text-xs text-ink-mute mt-3">Total clientes: {d.total_clientes}</p>
      </div>
    </div>
  );
}
