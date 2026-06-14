import { useState } from 'react';
import { BRAND_LOGO, BRAND_NAME } from '../config/brand.js';

// Página PÚBLICA de billetera de fidelización (sin login). Link: /billetera.
// El cliente ingresa su teléfono y ve su saldo de cashback, tier y movimientos.
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const fecha = (iso) => { try { return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleDateString('es-CL'); } catch { return ''; } };
const TIER = { ORO: { label: 'Oro', cls: 'bg-amber-100 text-amber-700 border-amber-300' },
  PLATA: { label: 'Plata', cls: 'bg-slate-200 text-slate-600 border-slate-300' },
  BRONCE: { label: 'Bronce', cls: 'bg-orange-100 text-orange-700 border-orange-300' } };

export default function PublicWallet() {
  const [phone, setPhone] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function consultar(e) {
    e?.preventDefault();
    setError(''); setData(null);
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) return setError('Ingresa tu teléfono (mínimo 8 dígitos).');
    setBusy(true);
    try {
      const r = await fetch(`/api/public/clients/${encodeURIComponent(digits)}/wallet`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Error');
      setData(d);
    } catch { setError('No pudimos consultar tu billetera. Intenta más tarde.'); }
    setBusy(false);
  }

  const tier = data && (TIER[data.tier] || TIER.BRONCE);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <header className="bg-ink text-white px-5 py-4 flex items-center gap-3">
        <img src={BRAND_LOGO} alt="" className="h-9 rounded-md" />
        <div className="font-black truncate">{BRAND_NAME}</div>
      </header>

      <main className="flex-1 grid place-items-center p-5">
        <div className="w-full max-w-md space-y-4">
          <div className="bg-white rounded-3xl shadow p-6">
            <h1 className="text-xl font-black mb-1">Tu billetera 💰</h1>
            <p className="text-slate-500 text-sm mb-4">Consulta tu cashback acumulado con tu teléfono.</p>
            <form onSubmit={consultar} className="flex gap-2">
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Tu teléfono"
                className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-cartel outline-none" />
              <button disabled={busy} className="px-5 py-3 rounded-xl bg-cartel text-white font-black disabled:opacity-50">
                {busy ? '…' : 'Ver'}
              </button>
            </form>
            {error && <p className="text-red-600 font-semibold text-sm mt-3">{error}</p>}
          </div>

          {data && data.found === false && (
            <div className="bg-white rounded-3xl shadow p-6 text-center">
              <div className="text-4xl mb-2">🐔</div>
              <p className="font-bold text-slate-700">Aún no tienes saldo</p>
              <p className="text-slate-500 text-sm mt-1">Gana {data.cashback_pct}% de cashback en cada compra. ¡Tu primera te espera!</p>
            </div>
          )}

          {data && data.found && (
            <div className="bg-white rounded-3xl shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-500">Hola, {data.name} 👋</div>
                  <div className="text-4xl font-black text-cartel">{money(data.points)}</div>
                  <div className="text-xs text-slate-400">disponibles · {data.cashback_pct}% por compra</div>
                </div>
                <span className={`text-xs font-black px-3 py-1 rounded-full border ${tier.cls}`}>{tier.label}</span>
              </div>

              {data.movements?.length > 0 && (
                <div className="mt-5">
                  <div className="text-xs font-black uppercase tracking-wide text-slate-400 mb-2">Movimientos</div>
                  <ul className="divide-y text-sm">
                    {data.movements.map((m, i) => (
                      <li key={i} className="flex justify-between py-2">
                        <span className="text-slate-600">{m.reason || m.type}</span>
                        <span className={`font-bold tabular-nums ${m.points >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {m.points >= 0 ? '+' : ''}{money(m.points)}
                          <span className="block text-[10px] text-slate-400 font-normal text-right">{fecha(m.at)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
