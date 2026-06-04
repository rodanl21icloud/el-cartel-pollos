import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n).toLocaleString('es-CL');
const UNITS = ['unidad', 'gramo', 'mililitro', 'litro', 'empaque'];

export default function Inventario() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [creating, setCreating] = useState(false);
  const [restockId, setRestockId] = useState(null);
  const [editStock, setEditStock] = useState(null);
  const [hasPin, setHasPin] = useState(true);

  async function load() {
    try { setItems(await api('/inventory/ingredients')); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); api('/settings').then((s) => setHasPin(!!s.has_admin_pin)).catch(() => {}); }, []);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 2600); }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-xl">Inventario de insumos</h2>
        <button onClick={() => setCreating(!creating)} className="px-4 py-2 rounded-xl bg-cartel text-white font-bold">
          {creating ? 'Cancelar' : '+ Nuevo insumo'}
        </button>
      </div>
      {error && <p className="text-red-600 font-semibold">{error}</p>}

      {creating && <NewIngredient onDone={() => { setCreating(false); load(); flash('Insumo creado'); }} onError={setError} />}

      <div className="bg-white rounded-2xl shadow divide-y">
        {items.map((i) => (
          <div key={i.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-black">{i.name}</div>
                <div className="text-sm text-zinc-500">
                  Stock: <b className={i.stock_qty <= i.min_stock_qty ? 'text-red-600' : ''}>{i.stock_qty} {i.unit}</b>
                  {' · '}mín {i.min_stock_qty} · costo {money(i.cost_unit)}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setRestockId(restockId === i.id ? null : i.id)}
                  className="px-3 py-2 rounded-lg bg-green-600 text-white font-bold">Reponer</button>
                <button onClick={() => setEditStock(i)} title="Editar costo y stock"
                  className="px-3 py-2 rounded-lg bg-ink text-white font-bold">Editar</button>
                <button onClick={() => delIngredient(i, load, flash, setError)}
                  className="px-3 py-2 rounded-lg bg-zinc-200 font-bold">Eliminar</button>
              </div>
            </div>
            {restockId === i.id && (
              <RestockForm ingredient={i} onDone={(r) => { setRestockId(null); load(); flash(`${r.ingredient}: ${r.new_stock} ${i.unit}`); }} onError={setError} />
            )}
          </div>
        ))}
        {!items.length && <p className="p-4 text-zinc-400">Sin insumos. Crea el primero.</p>}
      </div>

      {editStock && (
        <StockEditModal ingredient={editStock} hasPin={hasPin}
          onClose={() => setEditStock(null)}
          onDone={(msg) => { setEditStock(null); load(); flash(msg); }} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">{toast}</div>
      )}
    </div>
  );
}

// Ajuste manual de inventario AUDITADO (HU-INV-03): reemplazar o sumar/restar,
// con motivo, observación, vista de impacto, validación por unidad y PIN.
const REASONS = ['Conteo físico', 'Merma', 'Corrección manual', 'Compra no registrada', 'Error de carga', 'Producción/consumo extraordinario'];
const ENTERAS = new Set(['unidad', 'empaque']);
const r3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;

function StockEditModal({ ingredient, hasPin, onClose, onDone }) {
  const actual = Number(ingredient.stock_qty);
  const [unidad, setUnidad] = useState(ingredient.unit);
  const soloEnteros = ENTERAS.has(unidad);
  const [mode, setMode] = useState('REEMPLAZO');      // REEMPLAZO | AJUSTE
  const [valor, setValor] = useState('');             // valor ingresado (final o diferencia)
  const [reason, setReason] = useState(REASONS[0]);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [costo, setCosto] = useState(String(ingredient.cost_unit ?? ''));
  const [nombre, setNombre] = useState(ingredient.name);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const num = valor === '' ? NaN : Number(valor);
  // Cantidad final según el modo.
  const nuevo = !Number.isFinite(num) ? actual : (mode === 'REEMPLAZO' ? num : r3(actual + num));
  const delta = r3(nuevo - actual);
  const valido = Number.isFinite(num) && nuevo >= 0 && (!soloEnteros || Number.isInteger(nuevo));
  const stockChanged = valido && delta !== 0;
  const costoNum = costo === '' ? NaN : Number(costo);
  const costChanged = Number.isFinite(costoNum) && costoNum >= 0 && costoNum !== Number(ingredient.cost_unit);
  const nameChanged = nombre.trim() !== '' && nombre.trim() !== ingredient.name;
  const unitChanged = unidad !== ingredient.unit;

  async function save() {
    setErr('');
    if (!stockChanged && !costChanged && !nameChanged && !unitChanged) return setErr('No hay cambios que guardar');
    if (costo !== '' && !(Number.isFinite(costoNum) && costoNum >= 0)) return setErr('Costo unitario inválido');
    if (stockChanged && soloEnteros && !Number.isInteger(nuevo)) return setErr(`La unidad "${ingredient.unit}" no admite decimales`);
    const motivo = (reason === 'Otro' ? custom : reason).trim();
    if (!motivo) return setErr('Indica el motivo');
    if (!/^\d{4,8}$/.test(pin)) return setErr('PIN de 4 a 8 dígitos');
    setBusy(true);
    try {
      // Stock y costo se editan juntos por el endpoint auditado con PIN.
      await api(`/inventory/ingredients/${ingredient.id}/set-stock`, {
        method: 'POST',
        body: { new_qty: stockChanged ? nuevo : actual, reason: motivo, note: note.trim() || undefined, mode, pin, cost_unit: costChanged ? costoNum : undefined, name: nameChanged ? nombre.trim() : undefined, unit: unitChanged ? unidad : undefined },
      });
      const partes = [];
      if (nameChanged) partes.push(`nombre "${nombre.trim()}"`);
      if (unitChanged) partes.push(`unidad ${unidad}`);
      if (stockChanged) partes.push(`${actual} → ${nuevo} ${unidad}`);
      if (costChanged) partes.push(`costo ${money(costoNum)}`);
      onDone(`${nameChanged ? nombre.trim() : ingredient.name}: ${partes.join(' · ')}`);
    } catch (e) {
      setErr(e.message === 'PIN_INVALIDO' ? 'PIN incorrecto'
        : e.message === 'NOMBRE_DUPLICADO' ? 'Ya existe un insumo con ese nombre'
        : e.message === 'PIN_NO_CONFIGURADO' ? 'No hay PIN configurado. Pídele a gerencia que lo defina en Configuración.'
        : e.message === 'DECIMAL_NO_PERMITIDO' ? `La unidad "${ingredient.unit}" no admite decimales`
        : e.message === 'COSTO_INVALIDO' ? 'Costo unitario inválido'
        : e.message === 'UNIDAD_INVALIDA' ? 'Unidad de medida inválida'
        : e.message === 'DEMASIADOS_INTENTOS' ? 'Demasiados intentos. Espera unos minutos.'
        : e.message);
    } finally { setBusy(false); }
  }
  const Tab = ({ id, children }) => (
    <button onClick={() => { setMode(id); setValor(''); }}
      className={`flex-1 py-2 rounded-lg font-bold text-sm ${mode === id ? 'bg-cartel text-white' : 'bg-zinc-100 text-zinc-600'}`}>{children}</button>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg mb-1">Editar insumo</h3>
        <p className="text-sm text-zinc-500 mb-1">Edita el costo y/o ajusta el stock (el stock queda auditado).</p>
        <p className="text-sm mb-3">{ingredient.name} · stock <b>{actual} {ingredient.unit}</b> · costo <b>{money(ingredient.cost_unit)}</b></p>
        {!hasPin && <p className="text-xs bg-amber-50 text-amber-700 rounded-lg p-2 mb-3">⚠️ No hay PIN de administrador configurado. Gerencia debe definirlo en <b>Configuración</b> antes de poder ajustar.</p>}
        {err && <p className="text-red-600 font-semibold text-sm mb-2">{err}</p>}

        {/* Nombre del insumo */}
        <label className="block text-xs font-bold text-zinc-500 mb-1">Nombre</label>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={ingredient.name}
          className="w-full mb-3 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none font-bold" />

        {/* Unidad de medida */}
        <label className="block text-xs font-bold text-zinc-500 mb-1">Unidad de medida</label>
        <select value={unidad} onChange={(e) => setUnidad(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none font-bold">
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>

        {/* Costo unitario del insumo */}
        <label className="block text-xs font-bold text-zinc-500 mb-1">Costo unitario ($)</label>
        <input type="number" min="0" step="any" value={costo} onChange={(e) => setCosto(e.target.value)}
          placeholder={String(ingredient.cost_unit)}
          className="w-full mb-4 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none font-bold" />

        {/* Ajuste de stock (opcional) */}
        <p className="text-xs font-bold text-zinc-400 mb-1">Ajuste de stock (opcional)</p>
        <div className="flex gap-2 mb-3">
          <Tab id="REEMPLAZO">Reemplazar</Tab>
          <Tab id="AJUSTE">Sumar / Restar</Tab>
        </div>

        <label className="block text-xs font-bold text-zinc-500 mb-1">
          {mode === 'REEMPLAZO' ? `Nueva cantidad (${ingredient.unit})` : `Diferencia ± (${ingredient.unit})`}
        </label>
        <input type="number" step={soloEnteros ? '1' : 'any'} value={valor} onChange={(e) => setValor(e.target.value)} autoFocus
          placeholder={mode === 'REEMPLAZO' ? String(actual) : 'ej: 5000 o -20'}
          className="w-full mb-1 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-lg font-bold" />
        {soloEnteros && <p className="text-[11px] text-zinc-400 mb-1">Esta unidad solo admite números enteros.</p>}

        {/* Vista de impacto: antes → después */}
        {Number.isFinite(num) && (
          <div className={`rounded-xl p-3 mb-3 text-sm ${delta < 0 ? 'bg-red-50' : delta > 0 ? 'bg-emerald-50' : 'bg-zinc-50'}`}>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Stock</span>
              <span className="font-bold tabular-nums">{actual} <span className="text-zinc-400">→</span> {valido ? nuevo : '—'} {ingredient.unit}</span>
            </div>
            <div className={`text-right font-black ${delta < 0 ? 'text-red-600' : delta > 0 ? 'text-emerald-600' : 'text-zinc-400'}`}>
              {delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : ''}{delta} {ingredient.unit}
            </div>
            {delta < 0 && <div className="text-[11px] text-red-600 mt-1">⚠️ Estás disminuyendo el stock.</div>}
            {valido && nuevo <= Number(ingredient.min_stock_qty) && <div className="text-[11px] text-amber-600 mt-1">⚠️ Quedará en o bajo el stock mínimo ({ingredient.min_stock_qty}).</div>}
          </div>
        )}

        <label className="block text-xs font-bold text-zinc-500 mb-1">Motivo</label>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full mb-2 px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none">
          {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          <option value="Otro">Otro…</option>
        </select>
        {reason === 'Otro' && <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Describe el motivo"
          className="w-full mb-2 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />}

        <label className="block text-xs font-bold text-zinc-500 mb-1 mt-1">Observación (opcional)</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalle adicional…" maxLength={200}
          className="w-full mb-2 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />

        <label className="block text-xs font-bold text-zinc-500 mb-1 mt-1">PIN de administrador</label>
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••" maxLength={8} className="w-full mb-3 px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none tracking-widest" />

        <div className="flex gap-2">
          <button onClick={save} disabled={busy || (!stockChanged && !costChanged && !nameChanged && !unitChanged) || !hasPin} className="flex-1 btn-pos bg-cartel text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar'}</button>
          <button onClick={onClose} className="px-4 rounded-2xl bg-zinc-200 font-bold">Cancelar</button>
        </div>
        <p className="text-[11px] text-zinc-400 mt-3">Queda en auditoría: tipo, stock anterior y nuevo, motivo, observación, usuario y hora. No borra el historial del insumo.</p>
      </div>
    </div>
  );
}

async function delIngredient(i, reload, flash, setError) {
  setError('');
  try {
    await api(`/inventory/ingredients/${i.id}`, { method: 'DELETE' });
    flash(`${i.name} eliminado`); reload();
  } catch (e) {
    setError(e.message === 'INSUMO_EN_USO'
      ? `No se puede eliminar "${i.name}": está en una receta. Quítalo de las recetas primero.`
      : e.message === 'OTP_GERENCIA_REQUERIDO' ? 'Eliminar requiere OTP de gerencia' : e.message);
  }
}

function NewIngredient({ onDone, onError }) {
  const [f, setF] = useState({ name: '', unit: 'unidad', stock_qty: '', min_stock_qty: '', cost_unit: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    onError('');
    try {
      await api('/inventory/ingredients', {
        method: 'POST',
        body: {
          name: f.name.trim(), unit: f.unit,
          stock_qty: Number(f.stock_qty || 0), min_stock_qty: Number(f.min_stock_qty || 0), cost_unit: Number(f.cost_unit || 0),
        },
      });
      onDone();
    } catch (e) { onError(e.message === 'NOMBRE_DUPLICADO' ? 'Ya existe un insumo con ese nombre' : e.message); }
  }
  return (
    <div className="bg-white rounded-2xl p-4 shadow space-y-2">
      <input placeholder="Nombre del insumo" value={f.name} onChange={set('name')}
        className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <div className="grid grid-cols-2 gap-2">
        <select value={f.unit} onChange={set('unit')} className="px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none">
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <input type="number" min="0" placeholder="Costo unitario" value={f.cost_unit} onChange={set('cost_unit')}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        <input type="number" min="0" placeholder="Stock inicial" value={f.stock_qty} onChange={set('stock_qty')}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        <input type="number" min="0" placeholder="Stock mínimo (alerta)" value={f.min_stock_qty} onChange={set('min_stock_qty')}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      </div>
      <button onClick={save} className="w-full btn-pos bg-cartel text-white">Crear insumo</button>
    </div>
  );
}

function RestockForm({ ingredient, onDone, onError }) {
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState(String(ingredient.cost_unit));
  const [proveedor, setProveedor] = useState('');
  const [linkExpense, setLinkExpense] = useState(true);
  const [metodo, setMetodo] = useState('EFECTIVO');
  const monto = (Number(qty) || 0) * (Number(cost) || 0);
  async function save() {
    onError('');
    if (!(Number(qty) > 0)) return onError('Cantidad inválida');
    if (!(Number(cost) > 0)) return onError('Ingresa el costo unitario de esta compra');
    try {
      const r = await api(`/inventory/ingredients/${ingredient.id}/restock`, {
        method: 'POST',
        body: {
          qty: Number(qty), unit_cost: Number(cost),
          supplier: proveedor.trim() || undefined,
          expense: linkExpense ? { payment_method: metodo, supplier: proveedor.trim() || undefined } : undefined,
        },
      });
      onDone(r);
    } catch (e) { onError(e.message); }
  }
  return (
    <div className="mt-3 bg-zinc-50 rounded-xl p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min="0" placeholder={`Cantidad (${ingredient.unit})`} value={qty} onChange={(e) => setQty(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
        <input type="number" min="0" placeholder="Costo unitario de esta compra" value={cost} onChange={(e) => setCost(e.target.value)}
          className="px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      </div>
      <input placeholder="Proveedor (opcional)" value={proveedor} onChange={(e) => setProveedor(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none" />
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={linkExpense} onChange={(e) => setLinkExpense(e.target.checked)} />
        Registrar como gasto ({money(monto)})
      </label>
      {linkExpense && (
        <div className="flex gap-2">
          {['EFECTIVO', 'POS', 'TRANSFERENCIA'].map((m) => (
            <button key={m} onClick={() => setMetodo(m)}
              className={`flex-1 rounded-lg py-2 text-sm font-bold ${metodo === m ? 'bg-cartel text-white' : 'bg-zinc-200'}`}>{m}</button>
          ))}
        </div>
      )}
      <button onClick={save} className="w-full rounded-xl bg-green-600 text-white font-bold py-2">Confirmar reposición</button>
    </div>
  );
}
