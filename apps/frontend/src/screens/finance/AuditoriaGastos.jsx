import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { Spinner, ErrorState, EmptyState } from '../../components/ui/States.jsx';
import { Badge } from '../../components/ui/kit.jsx';

// Auditoría de Gastos: clasifica el riesgo tributario de cada gasto y permite
// completar metadata (RUT/documento) y marcar la revisión.
const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');
const fecha = (iso) => { try { return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }); } catch { return iso; } };
const RISK = { alto: { tone: 'bad', txt: '🔴 Alto' }, medio: { tone: 'warn', txt: '🟡 Medio' }, bajo: { tone: 'ok', txt: '🟢 Bajo' }, retiro: { tone: 'neutral', txt: '↗ Retiro' } };
const REVIEW = { pendiente: 'Pendiente', revisado: 'Revisado', confirmado: 'Confirmado', observacion: 'Observación' };
const FILTERS = [{ id: '', l: 'Todos' }, { id: 'alto', l: '🔴 Alto' }, { id: 'medio', l: '🟡 Medio' }, { id: 'bajo', l: '🟢 Bajo' }];

export default function AuditoriaGastos({ period: extPeriod } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [risk, setRisk] = useState('');
  const [edit, setEdit] = useState(null);

  const r = extPeriod || { from: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(), to: new Date().toISOString() };
  const qs = `from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}${risk ? `&risk=${risk}` : ''}`;

  async function load() {
    setError(null); setData(null);
    try { setData(await api(`/finance/expenses/audit?${qs}`)); } catch (e) { setError(e); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [r.from, r.to, risk]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Spinner label="Auditando gastos…" />;
  const s = data.summary;

  return (
    <div className="space-y-4">
      {/* Resumen en una frase */}
      <div className="card p-4">
        <div className="font-black mb-2">
          {s.alto > 0
            ? <span className="text-cartel">⚠️ {s.alto} gasto(s) de riesgo alto · {money(s.monto_riesgo)} en revisión</span>
            : <span className="text-emerald-600">✅ Sin gastos de riesgo alto en el período</span>}
        </div>
        <div className="flex gap-4 text-sm text-ink-mute flex-wrap">
          <span>🔴 Alto: <b>{s.alto}</b></span><span>🟡 Medio: <b>{s.medio}</b></span>
          <span>🟢 Bajo: <b>{s.bajo}</b></span><span>↗ Retiros: <b>{s.retiro}</b></span>
        </div>
      </div>

      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-card w-fit">
        {FILTERS.map((f) => <button key={f.id} onClick={() => setRisk(f.id)} className={`px-3 py-1.5 rounded-lg font-bold text-sm ${risk === f.id ? 'bg-cartel text-white' : 'text-ink-mute'}`}>{f.l}</button>)}
      </div>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[680px]">
          <thead><tr className="text-left text-ink-mute border-b">
            <th className="py-2 px-3">Fecha</th><th>Gasto</th><th>Proveedor</th><th>Categoría</th>
            <th className="text-right">Monto</th><th>Riesgo</th><th>Motivo</th><th>Revisión</th><th></th>
          </tr></thead>
          <tbody>
            {data.items.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="py-2 px-3 whitespace-nowrap text-ink-mute">{fecha(e.spent_at)}</td>
                <td className="font-semibold max-w-[180px] truncate" title={e.description}>{e.description}</td>
                <td className="text-ink-mute">{e.supplier || '—'}{e.meta.supplier_rut && <span className="text-[10px] block">{e.meta.supplier_rut}</span>}</td>
                <td className="text-ink-mute">{e.category}</td>
                <td className="text-right tabular-nums font-bold">{money(e.amount)}</td>
                <td><Badge tone={RISK[e.risk]?.tone}>{RISK[e.risk]?.txt}</Badge></td>
                <td className="text-xs text-ink-mute max-w-[200px]">{e.reason}</td>
                <td className="text-xs">{REVIEW[e.review_status]}</td>
                <td className="text-right pr-3"><button onClick={() => setEdit(e)} className="text-cartel font-bold text-xs">Revisar</button></td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan="9"><EmptyState icon="🧾" title="Sin gastos" hint="No hay gastos en el período/filtro." /></td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink-mute">{data.disclaimer}</p>

      {edit && <ReviewModal expense={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function ReviewModal({ expense, onClose, onSaved }) {
  const [m, setM] = useState({ ...expense.meta });
  const [status, setStatus] = useState(expense.review_status);
  const [notes, setNotes] = useState(expense.review_notes || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setM((x) => ({ ...x, [k]: v }));

  async function save() {
    setSaving(true); setErr('');
    try {
      await api(`/finance/expenses/${expense.id}/audit`, { method: 'POST', body: { meta: m, status, notes } });
      onSaved();
    } catch (e) { setErr(e.message); setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg">{expense.description}</h3>
        <p className="text-ink-mute text-sm mb-3">{money(expense.amount)} · {expense.category} · {fecha(expense.spent_at)}</p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Field label="RUT proveedor"><input value={m.supplier_rut || ''} onChange={(e) => set('supplier_rut', e.target.value)} placeholder="12345678-9" className="inp" /></Field>
          <Field label="RUT receptor (empresa)"><input value={m.company_rut || ''} onChange={(e) => set('company_rut', e.target.value)} placeholder="76xxxxxx-x" className="inp" /></Field>
          <Field label="Tipo documento">
            <select value={m.doc_type || ''} onChange={(e) => set('doc_type', e.target.value)} className="inp">
              <option value="">—</option><option value="FACTURA">Factura</option><option value="BOLETA">Boleta</option><option value="NINGUNO">Ninguno</option><option value="OTRO">Otro</option>
            </select>
          </Field>
          <Field label="N° documento"><input value={m.doc_number || ''} onChange={(e) => set('doc_number', e.target.value)} className="inp" /></Field>
          <Field label="Relación con el giro">
            <select value={m.giro_relation || 'directo'} onChange={(e) => set('giro_relation', e.target.value)} className="inp">
              <option value="directo">Directo</option><option value="indirecto">Indirecto</option><option value="dudoso">Dudoso</option>
            </select>
          </Field>
          <Field label="Categoría tributaria"><input value={m.tax_category || ''} onChange={(e) => set('tax_category', e.target.value)} className="inp" /></Field>
          <label className="col-span-2 flex items-center gap-2 font-bold"><input type="checkbox" checked={!!m.gives_credit} onChange={(e) => set('gives_credit', e.target.checked ? 1 : 0)} /> Da derecho a crédito fiscal (IVA)</label>
          <Field label="Estado de revisión">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="inp">
              {Object.entries(REVIEW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Notas / justificación"><input value={notes} onChange={(e) => setNotes(e.target.value)} className="inp" /></Field>
        </div>

        {err && <p className="text-cartel text-sm mt-2">{err}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-slate-100 font-bold">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-cartel text-white font-black disabled:opacity-60">{saving ? 'Guardando…' : 'Guardar'}</button>
        </div>
        <style>{`.inp{width:100%;padding:.5rem .6rem;border:2px solid #e2e8f0;border-radius:.6rem}`}</style>
      </div>
    </div>
  );
}
const Field = ({ label, children }) => <label className="block"><span className="text-[11px] text-ink-mute font-bold">{label}</span>{children}</label>;
