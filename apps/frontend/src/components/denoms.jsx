// ============================================================
// Denominaciones CLP (billetes y monedas) y contador reutilizable.
// Compartido por la apertura (AbrirCajaModal) y el cierre (CashClose).
// ============================================================
const money = (n) => '$' + Number(n).toLocaleString('es-CL');

export const DENOMS = [
  { v: 20000, t: 'billete' }, { v: 10000, t: 'billete' }, { v: 5000, t: 'billete' },
  { v: 2000, t: 'billete' }, { v: 1000, t: 'billete' },
  { v: 500, t: 'moneda' }, { v: 100, t: 'moneda' }, { v: 50, t: 'moneda' }, { v: 10, t: 'moneda' },
];

export const denomTotal = (counts) =>
  DENOMS.reduce((s, d) => s + d.v * (Number(counts[d.v]) || 0), 0);

// ¿El usuario tocó al menos una denominación? (distingue "conté y está en $0"
// de "no ingresé nada"). Una celda tocada guarda 0 o un número, no undefined.
export const denomTocado = (counts) =>
  DENOMS.some((d) => counts[d.v] !== undefined && counts[d.v] !== '');

// Conteo de billetes y monedas por denominación.
export function DenomCounter({ counts, onChange }) {
  return (
    <div className="space-y-2">
      {DENOMS.map((d) => {
        const sub = d.v * (Number(counts[d.v]) || 0);
        return (
          <div key={d.v} className="flex items-center gap-3">
            <span className="text-lg">{d.t === 'billete' ? '💵' : '🪙'}</span>
            <span className="w-20 font-bold text-zinc-700">{money(d.v)}</span>
            <input type="number" min="0" inputMode="numeric" value={counts[d.v] ?? ''} placeholder="0"
              onChange={(e) => onChange(d.v, e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-right" />
            <span className="w-20 text-right text-zinc-500 text-sm tabular-nums">{money(sub)}</span>
          </div>
        );
      })}
    </div>
  );
}
