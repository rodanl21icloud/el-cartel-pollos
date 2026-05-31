import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');

// Flujo de caja de TODO el dinero (efectivo + POS + transferencia). Solo gerencia.
export default function Flujo({ role }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (role !== 'GERENCIA') return;
    api('/reports/cash-flow').then(setData).catch((e) => setError(e.message));
  }, [role]);

  if (role !== 'GERENCIA') {
    return <p className="text-zinc-500 text-center mt-10">Solo la gerencia puede ver el flujo de caja.</p>;
  }
  if (error) return <p className="text-red-600 text-center mt-10">{error}</p>;
  if (!data) return <p className="text-zinc-500 text-center mt-10">Cargando flujo de caja…</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <Card label="Ingresos" value={data.total_ingresos} color="text-green-600" />
        <Card label="Egresos" value={data.total_egresos} color="text-red-600" />
        <Card label="Neto" value={data.neto} color={data.neto >= 0 ? 'text-green-700' : 'text-red-700'} />
      </div>

      {/* Flujo por día */}
      <div className="bg-white rounded-2xl p-4 shadow">
        <h2 className="font-black text-lg mb-3">Movimiento diario (últimos 30 días)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-500 border-b">
                <th className="py-2">Día</th>
                <th className="text-right">Ingresos</th>
                <th className="text-right">Egresos</th>
                <th className="text-right">Neto</th>
                <th className="text-right">Saldo acum.</th>
              </tr>
            </thead>
            <tbody>
              {data.por_dia.map((d) => (
                <tr key={d.dia} className="border-b last:border-0">
                  <td className="py-2 font-semibold">{d.dia}</td>
                  <td className="text-right text-green-600">{money(d.ingresos)}</td>
                  <td className="text-right text-red-600">{money(d.egresos)}</td>
                  <td className={`text-right font-bold ${d.neto >= 0 ? 'text-green-700' : 'text-red-700'}`}>{money(d.neto)}</td>
                  <td className="text-right font-black">{money(d.saldo_acumulado)}</td>
                </tr>
              ))}
              {!data.por_dia.length && <tr><td colSpan="5" className="py-3 text-zinc-400">Sin movimientos en el período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Egresos por categoría */}
      <div className="bg-white rounded-2xl p-4 shadow">
        <h2 className="font-black text-lg mb-3">Egresos por categoría</h2>
        <ul className="space-y-1 text-sm">
          {data.egresos_por_categoria.map((c) => (
            <li key={c.categoria} className="flex justify-between">
              <span>{c.categoria} {c.kind === 'RETIRO' && <span className="text-xs text-zinc-400">(retiro)</span>}</span>
              <span className="font-bold">{money(c.monto)}</span>
            </li>
          ))}
          {!data.egresos_por_categoria.length && <li className="text-zinc-400">Sin egresos.</li>}
        </ul>
      </div>
    </div>
  );
}

function Card({ label, value, color }) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow text-center">
      <div className="text-xs text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-black ${color}`}>{money(value)}</div>
    </div>
  );
}
