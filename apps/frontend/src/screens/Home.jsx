import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { PageHeader, KpiCard, Badge } from '../components/ui/kit.jsx';
import { Icon } from '../config/icons.jsx';

// "Hoy" — centro de mando. Gerencia/encargado ven el panel compuesto (/api/today);
// caja/cocina conservan su home liviano de acciones rápidas (sin reports.view).
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const SEV = { AGOTADO: 'bad', CRITICO: 'bad', BAJO: 'warn' };
const SUB = { caja: 'Vende rápido y cierra cuadrado', cocina: 'Que nada se atrase', mando: 'Tu negocio de un vistazo' };
const ALERT_CLS = { red: 'bg-red-50 border-red-300 text-red-700', amber: 'bg-amber-50 border-amber-300 text-amber-700' };

function archetype(role) {
  if (role === 'GERENCIA' || role === 'ADMIN' || role === 'SUPERVISOR') return 'mando';
  if (role === 'PREPARADOR' || role === 'DESPACHO') return 'cocina';
  return 'caja';
}

function Action({ icon, label, onClick, primary }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition shadow-card ${primary ? 'bg-cartel text-white hover:opacity-90' : 'bg-white text-ink hover:bg-slate-50'}`}>
      <Icon name={icon} size={18} /> {label}
    </button>
  );
}

export default function Home({ role, onGo, userName }) {
  const tipo = archetype(role);
  if (tipo === 'mando') return <CommandCenter onGo={onGo} userName={userName} />;
  return <QuickHome tipo={tipo} onGo={onGo} userName={userName} />;
}

// --- Centro de mando (gerencia / encargado) ---
function CommandCenter({ onGo, userName }) {
  const [t, setT] = useState(undefined); // undefined=cargando, null=error
  useEffect(() => { api('/today').then(setT).catch(() => setT(null)); }, []);

  if (t === undefined) return <div className="max-w-4xl mx-auto"><PageHeader title="Hoy" subtitle="Cargando tu turno…" /><p className="text-ink-mute animate-pulse mt-6 text-center">Reuniendo los números del día…</p></div>;
  if (t === null) return <div className="max-w-4xl mx-auto"><PageHeader title="Hoy" /><p className="text-red-600 font-semibold mt-6 text-center">No pudimos cargar el panel. Reintenta.</p></div>;

  const v = t.ventas;
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader title={`Hoy${userName ? ', ' + userName : ''}`} subtitle={SUB.mando} />

      {/* Alertas accionables (semáforo) */}
      {t.alerts.length > 0 && (
        <div className="space-y-2">
          {t.alerts.map((a, i) => (
            <button key={i} onClick={() => onGo(a.route)}
              className={`w-full text-left rounded-xl border px-4 py-3 flex items-center gap-3 ${ALERT_CLS[a.level] || ALERT_CLS.amber}`}>
              <span className="text-lg">{a.level === 'red' ? '🔴' : '🟠'}</span>
              <div className="min-w-0 flex-1">
                <div className="font-black">{a.msg}</div>
                <div className="text-xs opacity-80">{a.action}</div>
              </div>
              <span className="font-bold shrink-0">Ir →</span>
            </button>
          ))}
        </div>
      )}

      {/* KPIs del día */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Ventas hoy" value={money(v.total)} delta={v.delta_pct} big />
        <KpiCard label="Ticket prom." value={money(v.ticket)} />
        <KpiCard label="Pedidos activos" value={t.pedidos_activos} alert={t.pedidos_activos > 0} />
        <KpiCard label="Food cost" value={`${t.food_cost_pct}%`} alert={t.food_cost_pct >= 30} />
      </div>
      {v.delta_pct != null && (
        <p className="text-xs text-ink-mute -mt-2 px-1">
          {v.delta_pct >= 0 ? '▲' : '▼'} {Math.abs(v.delta_pct)}% vs. mismo día semana pasada ({money(v.vs_semana_pasada)}) · {v.n} venta(s) hoy
        </p>
      )}

      {/* Caja */}
      <div className="card p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="cash" size={20} className="text-ink-mute" />
          <div>
            <div className="font-black">{t.caja.open ? 'Caja abierta' : 'Caja sin abrir'}</div>
            {t.caja.open && <div className="text-xs text-ink-mute">Fondo {money(t.caja.opening_float)}</div>}
          </div>
        </div>
        {t.caja.open ? <Badge tone="ok">Abierta</Badge>
          : <button onClick={() => onGo('cash')} className="px-4 py-2 rounded-xl bg-cartel text-white font-bold">Abrir caja</button>}
      </div>

      {/* Pollo del día (horno) */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-black flex items-center gap-2"><Icon name="flame" size={18} className="text-cartel" /> Pollo del día</h3>
          <button onClick={() => onGo('prediccion')} className="text-sm font-bold text-cartel">Plan de horno →</button>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><div className="text-2xl font-black">{t.horno.enviados}</div><div className="text-xs text-ink-mute">al horno</div></div>
          <div><div className="text-2xl font-black">{t.horno.precocidos}</div><div className="text-xs text-ink-mute">precocidos</div></div>
          <div><div className={`text-2xl font-black ${t.horno.conciliacion === 'no_explicada' ? 'text-red-600' : ''}`}>{t.horno.disponible_estimado}</div><div className="text-xs text-ink-mute">disponible est.</div></div>
        </div>
        <p className="text-[11px] text-ink-mute mt-2">
          Vendidos ≈ {t.horno.vendidos_equiv} enteros ({t.horno.porciones_vendidas} porciones) · merma {t.horno.merma} ·{' '}
          {t.horno.conciliacion === 'no_explicada'
            ? <b className="text-red-600">descalce: revisa conteo/merma</b>
            : t.horno.conciliacion === 'explicada'
              ? <b className="text-green-600">conciliado ✓</b>
              : 'sin lotes de horno hoy'}
        </p>
      </div>

      {/* Top productos */}
      {t.top.length > 0 && (
        <div className="card p-4">
          <h3 className="font-black mb-2">🔥 Top del día</h3>
          <ul className="divide-y text-sm">
            {t.top.map((p, i) => (
              <li key={i} className="flex justify-between py-1.5">
                <span className="text-ink">{p.name} <span className="text-ink-mute">· {p.unidades}u</span></span>
                <span className="font-bold tabular-nums">{money(p.monto)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stock crítico */}
      {t.stock_critico.count > 0 && (
        <div className="card p-4 border border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black text-amber-700">⚠ {t.stock_critico.count} insumo(s) en stock crítico</h3>
            <button onClick={() => onGo('inventario')} className="text-sm font-bold text-cartel">Reponer →</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {t.stock_critico.items.map((s, i) => <Badge key={i} tone="warn">{s.name} · {s.stock}{s.unit ? ` ${s.unit}` : ''}</Badge>)}
          </div>
        </div>
      )}

      {/* Incidencias de auditoría del día */}
      {t.incidencias.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black">🛡 Incidencias del turno</h3>
            <button onClick={() => onGo('auditoria')} className="text-sm font-bold text-cartel">Auditoría →</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {t.incidencias.map((x, i) => <Badge key={i} tone={x.severity === 'ALERT' ? 'bad' : 'warn'}>{x.action}</Badge>)}
          </div>
        </div>
      )}

      {/* Cierre anterior */}
      {t.cierre_anterior && (
        <div className="text-xs text-ink-mute px-1">
          Último cierre: diferencia {money(t.cierre_anterior.diff_total)}
          {t.cierre_anterior.descuadre ? ' · ⚠ con descuadre' : ' · cuadrado ✓'}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Action icon="cart" label="Vender" onClick={() => onGo('pos')} primary />
        <Action icon="pie" label="Finanzas" onClick={() => onGo('finanzas')} />
        <Action icon="cash" label="Caja y turno" onClick={() => onGo('cash')} />
      </div>
    </div>
  );
}

// --- Home liviano (caja / cocina) ---
function QuickHome({ tipo, onGo, userName }) {
  const [caja, setCaja] = useState(null);
  const [coc, setCoc] = useState(null);
  useEffect(() => {
    api('/cash-register/current').then(setCaja).catch(() => {});
    if (tipo === 'cocina') api('/dispatch').then(setCoc).catch(() => {});
  }, [tipo]);

  const activos = (coc?.orders || []).filter((o) => o.status !== 'ENTREGADO');
  const porEstado = (s) => activos.filter((o) => o.status === s).length;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader title={`Hola${userName ? ', ' + userName : ''}`} subtitle={SUB[tipo]} />

      {tipo !== 'cocina' && caja && (
        <div className="card p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="cash" size={20} className="text-ink-mute" />
            <div>
              <div className="font-black">{caja.open ? 'Caja abierta' : 'Caja sin abrir'}</div>
              {caja.open && <div className="text-xs text-ink-mute">Fondo {money(caja.opening_float)}</div>}
            </div>
          </div>
          {caja.open ? <Badge tone="ok">Abierta</Badge>
            : <button onClick={() => onGo('cash')} className="px-4 py-2 rounded-xl bg-cartel text-white font-bold">Abrir caja</button>}
        </div>
      )}

      {tipo === 'cocina' && (
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Pendientes" value={porEstado('PENDIENTE')} alert={porEstado('PENDIENTE') > 0} />
          <KpiCard label="En preparación" value={porEstado('EN_PREPARACION')} />
          <KpiCard label="Listos" value={porEstado('LISTO')} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {tipo === 'caja' && <>
          <Action icon="cart" label="Nueva venta" onClick={() => onGo('pos')} primary />
          <Action icon="cash" label="Caja" onClick={() => onGo('cash')} />
          <Action icon="receipt" label="Pedidos" onClick={() => onGo('ventas')} />
        </>}
        {tipo === 'cocina' && <>
          <Action icon="chef" label="Abrir tablero" onClick={() => onGo('kds')} primary />
          <Action icon="moto" label="Despacho" onClick={() => onGo('despacho')} />
          <Action icon="flame" label="Plan de horno" onClick={() => onGo('prediccion')} />
        </>}
      </div>
    </div>
  );
}
