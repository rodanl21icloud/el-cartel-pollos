import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { PageHeader, KpiCard, Badge } from '../components/ui/kit.jsx';
import { Icon } from '../config/icons.jsx';

// Home por rol (Fase 2, S3): pantalla inicial accionable. Mismo layout,
// contenido radicalmente distinto según el momento de trabajo del usuario.
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const SEV = { AGOTADO: 'bad', CRITICO: 'bad', BAJO: 'warn' };
const SUB = { caja: 'Vende rápido y cierra cuadrado', cocina: 'Que nada se atrase', encargado: 'Tu turno bajo control', gerencia: 'Tu negocio de un vistazo' };

function archetype(role) {
  if (role === 'GERENCIA' || role === 'ADMIN') return 'gerencia';
  if (role === 'PREPARADOR' || role === 'DESPACHO') return 'cocina';
  if (role === 'SUPERVISOR') return 'encargado';
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
  const [caja, setCaja] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [coc, setCoc] = useState(null);

  useEffect(() => {
    api('/cash-register/current').then(setCaja).catch(() => {});
    if (tipo === 'encargado' || tipo === 'gerencia') api('/inventory/alerts').then(setAlerts).catch(() => {});
    if (tipo === 'gerencia') {
      const from = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      api(`/reports/estadisticas/ventas?from=${encodeURIComponent(from)}`).then(setKpis).catch(() => {});
    }
    if (tipo === 'cocina') api('/dispatch').then(setCoc).catch(() => {});
  }, [tipo]);

  const activos = (coc?.orders || []).filter((o) => o.status !== 'ENTREGADO');
  const porEstado = (s) => activos.filter((o) => o.status === s).length;
  const alertList = alerts?.alerts || [];
  const k = kpis?.kpis;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader title={`Hola${userName ? ', ' + userName : ''}`} subtitle={SUB[tipo]} />

      {/* Estado de caja (todos menos cocina) */}
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

      {/* Alertas de stock (encargado / gerencia) */}
      {alertList.length > 0 && (
        <div className="card p-4 border border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black text-amber-700">⚠ {alertList.length} insumo(s) por reponer</h3>
            <button onClick={() => onGo('inventario')} className="text-sm font-bold text-cartel">Reponer →</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {alertList.slice(0, 6).map((a) => (
              <Badge key={a.id} tone={SEV[a.severidad] || 'warn'}>{a.name}{a.dias_a_quiebre != null ? ` · ~${a.dias_a_quiebre}d` : ''}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* KPIs gerencia (hoy) */}
      {tipo === 'gerencia' && k && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Ventas hoy" value={money(k.total_ventas?.valor)} delta={k.total_ventas?.var} big />
          <KpiCard label="Ganancia" value={money(k.ganancia?.valor)} delta={k.ganancia?.var} big />
          <KpiCard label="Ticket prom." value={money(k.ticket?.valor)} delta={k.ticket?.var} />
          <KpiCard label="Pedidos" value={k.pedidos?.valor ?? 0} delta={k.pedidos?.var} />
        </div>
      )}

      {/* KPIs cocina */}
      {tipo === 'cocina' && (
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Pendientes" value={porEstado('PENDIENTE')} alert={porEstado('PENDIENTE') > 0} />
          <KpiCard label="En preparación" value={porEstado('EN_PREPARACION')} />
          <KpiCard label="Listos" value={porEstado('LISTO')} />
        </div>
      )}

      {/* Acciones rápidas por rol */}
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
        {tipo === 'encargado' && <>
          <Action icon="box" label="Reponer stock" onClick={() => onGo('inventario')} primary />
          <Action icon="cash" label="Caja y turno" onClick={() => onGo('cash')} />
          <Action icon="trash" label="Mermas" onClick={() => onGo('merma')} />
          <Action icon="cart" label="Vender" onClick={() => onGo('pos')} />
        </>}
        {tipo === 'gerencia' && <>
          <Action icon="pie" label="Finanzas" onClick={() => onGo('finanzas')} primary />
          <Action icon="chart" label="Precios de compra" onClick={() => onGo('precios')} />
          <Action icon="cart" label="Vender" onClick={() => onGo('pos')} />
        </>}
      </div>
    </div>
  );
}
