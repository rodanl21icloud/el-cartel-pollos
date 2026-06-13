import { useEffect, useState } from 'react';

// Precio editable inline (guarda al perder foco / Enter si cambió).
export default function PriceCell({ value, onSave }) {
  const [v, setV] = useState(String(value));
  useEffect(() => { setV(String(value)); }, [value]);
  return (
    <input type="number" min="0" value={v} onChange={(e) => setV(e.target.value)}
      onBlur={() => onSave(v)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      className="w-24 px-2 py-1 rounded-lg border-2 border-zinc-200 focus:border-cartel outline-none text-right tabular-nums" />
  );
}
