import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Spinner, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { Badge } from '../../components/ui/kit.jsx';

// Ingeniería de Costos: costo unitario, margen, food cost y desviación por producto.
// Reutiliza el BOM y los costos congelados de venta (no duplica P&L).
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const pct = (n) => (n == null ? '—' : Number(n).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + '%');

// Semáforo de food cost: bajo = sano, alto = caro.
const foodTone = (fc) => (fc == null ? 'neutral' : fc <= 35 ? 'ok' : fc <= 50 ? 'warn' : 'bad');

export default function Costos({ period: extPeriod } = {}) {
  const [data, setData] = useState(null);
  const [dev, setDev] = useState(null);
  const [error, setError] = useState(null);
  const [cat, setCat] = useState('');
  const [threshold, setThreshold] = useState(3);
  const [openId, setOpenId] = useState(null);

  const r = extPeriod || { from: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(), to: new Date().toISOString() };
  const qs = `from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`;

  async function load() {
    setError(null); setData(null);
    try {
      const [s, d] = await Promise.all([
        api(`/finance/costs/summary?${qs}`),
        api(`/finance/costs/deviations?${qs}&threshold=${threshold}`),
      ]);
      setData(s); setDev(d);
    } catch (e) { setError(e); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [r.from, r.to, threshold]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Spinner label="Calculando costos…" />;

  const cats = [...new Set(data.products.map((p) => p.category))].sort();
  const rows = data.products.filter((p) => (!cat || p.category === cat));
  const sinCosto = data.products.filter((p) => !p.cost_loaded).length;

  return (
    <div className="space-y-4">
      {/* Resumen en una frase + alertas accionables */}
      {dev?.alerts?.length > 0 ? (
        <div className="card p-4 border-l-4 border-cartel bg-cartel/5">
          <div className="font-black text-cartel mb-1">⚠️ {dev.alerts.length} producto(s) con desviación sobre {dev.threshold}%</div>
          <ul className="text-sm space-y-0.5">
            {dev.alerts.slice(0, 4).map((a) => (
              <li key={a.product_id}>
                <b>{a.name}</b>: el costo {a.deviation_pct > 0 ? 'subió' : 'bajó'} <b>{pct(Math.abs(a.deviation_pct))}</b>
                <span className="text-ink-mute"> · {a.cause}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="card p-4 text-sm text-ink-mute">Sin desviaciones de costo sobre el umbral en el período. ✅</div>
      )}

      {/* Controles */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-card flex-wrap">
          <button onClick={() => setCat('')} className={`px-3 py-1.5 rounded-lg font-bold text-sm ${!cat ? 'bg-cartel text-white' : 'text-ink-mute'}`}>Todas</button>
          {cats.map((c) => <button key={c} onClick={() => setCat(c)} className={`px-3 py-1.5 rounded-lg font-bold text-sm ${cat === c ? 'bg-cartel text-white' : 'text-ink-mute'}`}>{c}</button>)}
        </div>
        <label className="text-sm text-ink-mute flex items-center gap-2">
          Umbral alerta
          <select value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="px-2 py-1.5 rounded-lg border-2 border-slate-200 font-bold">
            {[1, 2, 3, 5, 10].map((v) => <option key={v} value={v}>{v}%</option>)}
          </select>
        </label>
      </div>

      {sinCosto > 0 && <p className="text-xs text-amber-600">⚠️ {sinCosto} producto(s) sin receta cargada: su margen/food cost no se calcula.</p>}

      {/* Tabla de costos */}
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-ink-mute border-b">
              <th className="py-2 px-3">Producto</th>
              <th className="text-right">Precio</th>
              <th className="text-right">Costo unit.</th>
              <th className="text-right">Margen</th>
              <th className="text-right">Food cost</th>
              <th className="text-right">Desviación</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <RowProduct key={p.id} p={p} qs={qs} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />
            ))}
            {!rows.length && <tr><td colSpan="7"><EmptyState icon="📦" title="Sin productos" hint="No hay productos activos en esta categoría." /></td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink-mute">{data.disclaimer}</p>
    </div>
  );
}

function RowProduct({ p, qs, open, onToggle }) {
  return (
    <>
      <tr className="border-b last:border-0 hover:bg-slate-50">
        <td className="py-2 px-3 font-semibold">{p.name}{!p.cost_loaded && <span className="text-amber-600 text-xs"> · sin receta</span>}</td>
        <td className="text-right tabular-nums">{money(p.price)}</td>
        <td className="text-right tabular-nums">{p.cost_loaded ? money(p.unit_cost) : '—'}</td>
        <td className={`text-right font-bold tabular-nums ${p.gross_margin_pct == null ? 'text-ink-mute' : p.gross_margin_pct >= 50 ? 'text-emerald-600' : p.gross_margin_pct >= 35 ? 'text-amber-600' : 'text-cartel'}`}>
          {p.cost_loaded ? `${money(p.gross_margin)} · ${pct(p.gross_margin_pct)}` : '—'}
        </td>
        <td className="text-right"><Badge tone={foodTone(p.food_cost_pct)}>{pct(p.food_cost_pct)}</Badge></td>
        <td className="text-right tabular-nums">
          {p.cost_trend_pct == null ? <span className="text-ink-mute">—</span>
            : <span className={`font-bold ${p.cost_trend_pct > 0 ? 'text-cartel' : 'text-emerald-600'}`}>{p.cost_trend_pct > 0 ? '▲' : '▼'} {pct(Math.abs(p.cost_trend_pct))}</span>}
        </td>
        <td className="text-right pr-3">
          {p.cost_loaded && <button onClick={onToggle} className="text-cartel font-bold text-xs">{open ? 'Ocultar' : 'Detalle'}</button>}
        </td>
      </tr>
      {open && <tr><td colSpan="7" className="bg-slate-50 px-3 py-2"><RecipeDetail productId={p.id} qs={qs} /></td></tr>}
    </>
  );
}

function RecipeDetail({ productId }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api(`/products/${productId}/recipe`).then(setD).catch(setErr); }, [productId]);
  if (err) return <p className="text-cartel text-xs">No se pudo cargar la receta.</p>;
  if (!d) return <p className="text-ink-mute text-xs">Cargando receta…</p>;
  if (!d.lines.length) return <p className="text-ink-mute text-xs">Sin insumos en la receta.</p>;
  return (
    <table className="w-full text-xs">
      <thead><tr className="text-ink-mute text-left"><th className="py-1">Insumo</th><th className="text-right">Cantidad</th><th className="text-right">Costo unit.</th><th className="text-right">Costo línea</th></tr></thead>
      <tbody>
        {d.lines.map((l) => (
          <tr key={l.ingredient_id} className="border-t border-slate-200">
            <td className="py-1">{l.ingredient}</td>
            <td className="text-right tabular-nums">{l.qty_per_unit} {l.unit}</td>
            <td className="text-right tabular-nums">{money(l.cost_unit)}</td>
            <td className="text-right tabular-nums font-semibold">{money(l.line_cost)}</td>
          </tr>
        ))}
        <tr className="border-t-2 border-slate-300 font-black"><td className="py-1" colSpan="3">Costo insumos</td><td className="text-right tabular-nums">{money(d.costo_insumos)}</td></tr>
      </tbody>
    </table>
  );
}
