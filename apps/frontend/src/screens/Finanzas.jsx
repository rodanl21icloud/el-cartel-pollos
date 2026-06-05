import { useState } from 'react';
import PeriodNav from '../components/PeriodNav.jsx';
import Resumen from './Resumen.jsx';
import Estadisticas from './Estadisticas.jsx';
import Gastos from './Gastos.jsx';
import Flujo from './Flujo.jsx';
import Banco from './Banco.jsx';
import Movimientos from './Movimientos.jsx';
import Pnl from './Pnl.jsx';
import Cuadre from './Cuadre.jsx';

// Hub de Finanzas (Fase 1): una sola entrada con pestañas. Reúne las antiguas
// 8 secciones financieras (Resumen, Estadísticas, Gastos, Flujo, Banco,
// Movimientos, P&L, Cuadre) reutilizando sus componentes tal cual.
const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'ventas', label: 'Ventas' },
  { id: 'gastos', label: 'Gastos' },
  { id: 'flujo', label: 'Flujo y banco' },
  { id: 'detalle', label: 'Detalle' },
  { id: 'resultado', label: 'Resultado' },
  { id: 'turno', label: 'Cuadre de turno' },
];

// Pestañas gobernadas por el período global del hub.
const PERIOD_TABS = new Set(['resumen', 'ventas', 'flujo', 'detalle', 'resultado']);

export default function Finanzas({ role }) {
  const [tab, setTab] = useState('resumen');
  const [period, setPeriod] = useState(null); // período ÚNICO compartido por todas las pestañas
  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-black text-2xl mb-2">Finanzas</h2>
          <div className="flex gap-1 bg-white rounded-xl p-1 shadow-card overflow-x-auto">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2 rounded-lg font-bold text-sm whitespace-nowrap ${tab === t.id ? 'bg-cartel text-white' : 'text-ink-mute'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {PERIOD_TABS.has(tab) && <PeriodNav onChange={setPeriod} />}
      </div>

      {tab === 'resumen' && period && <Resumen period={period} />}
      {tab === 'ventas' && period && <Estadisticas period={period} />}
      {tab === 'gastos' && <Gastos />}
      {tab === 'flujo' && period && <div className="space-y-4"><Flujo period={period} /><Banco role={role} /></div>}
      {tab === 'detalle' && period && <Movimientos period={period} />}
      {tab === 'resultado' && period && <Pnl period={period} />}
      {tab === 'turno' && <Cuadre />}
    </div>
  );
}
