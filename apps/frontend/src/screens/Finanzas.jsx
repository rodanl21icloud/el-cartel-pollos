import { useState } from 'react';
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

export default function Finanzas({ role }) {
  const [tab, setTab] = useState('resumen');
  return (
    <div className="max-w-6xl mx-auto space-y-4">
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

      {tab === 'resumen' && <Resumen role={role} />}
      {tab === 'ventas' && <Estadisticas />}
      {tab === 'gastos' && <Gastos />}
      {tab === 'flujo' && <div className="space-y-4"><Flujo role={role} /><Banco role={role} /></div>}
      {tab === 'detalle' && <Movimientos />}
      {tab === 'resultado' && <Pnl role={role} />}
      {tab === 'turno' && <Cuadre />}
    </div>
  );
}
