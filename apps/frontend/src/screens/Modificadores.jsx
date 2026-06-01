import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

// Gestión de adiciones / modificadores: grupos, opciones y asignación a productos.
export default function Modificadores({ role }) {
  const [groups, setGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [creating, setCreating] = useState(false);
  const [assignFor, setAssignFor] = useState(null);
  const otpArg = role !== 'GERENCIA' ? undefined : undefined; // grupos son POST/PUT no triviales; OTP no aplica a POST

  async function load() {
    try {
      const [g, p] = await Promise.all([api('/modifiers'), api('/products/catalog')]);
      setGroups(g); setProducts(p);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2200); }

  async function createGroup(body) { try { await api('/modifiers/groups', { method: 'POST', body }); setCreating(false); load(); flash('Grupo creado'); } catch (e) { setError(e.message); } }
  async function delGroup(g) { if (!confirm(`¿Eliminar grupo "${g.name}"?`)) return; try { await api(`/modifiers/groups/${g.id}`, { method: 'DELETE' }); load(); } catch (e) { setError(e.message); } }
  async function addOption(groupId, name, price) { try { await api('/modifiers/options', { method: 'POST', body: { group_id: groupId, name, price_delta: Number(price) || 0 } }); load(); } catch (e) { setError(e.message); } }
  async function delOption(id) { try { await api(`/modifiers/options/${id}`, { method: 'DELETE' }); load(); } catch (e) { setError(e.message); } }

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-xl">Adiciones / Modificadores</h2>
        <button onClick={() => setCreating(!creating)} className="px-4 py-2 rounded-xl bg-cartel text-white font-bold">{creating ? 'Cancelar' : '+ Nuevo grupo'}</button>
      </div>
      {error && <p className="text-red-600 font-semibold">{error}</p>}
      {creating && <NewGroup onSave={createGroup} />}

      {groups.map((g) => (
        <div key={g.id} className="bg-white rounded-2xl p-4 shadow">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-black">{g.name}</div>
              <div className="text-xs text-zinc-400">
                {g.is_required ? 'Obligatorio · ' : ''}elige {g.min_select}–{g.max_select || '∞'} · {g.product_ids.length} producto(s)
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAssignFor(g)} className="px-3 py-1.5 rounded-lg bg-zinc-100 font-bold text-sm">Asignar productos</button>
              <button onClick={() => delGroup(g)} className="text-zinc-400 hover:text-red-600 text-lg">🗑</button>
            </div>
          </div>

          <ul className="mt-3 space-y-1">
            {g.options.map((o) => (
              <li key={o.id} className="flex items-center justify-between text-sm bg-zinc-50 rounded-lg px-3 py-1.5">
                <span>{o.name} {o.price_delta > 0 && <span className="text-cartel font-bold">+{money(o.price_delta)}</span>}</span>
                <button onClick={() => delOption(o.id)} className="text-zinc-400 hover:text-red-600">✕</button>
              </li>
            ))}
            {!g.options.length && <li className="text-zinc-400 text-sm">Sin opciones aún.</li>}
          </ul>
          <NewOption onAdd={(n, p) => addOption(g.id, n, p)} />
        </div>
      ))}
      {!groups.length && !creating && <p className="text-zinc-400">Crea tu primer grupo (ej. "Presa preferida", "Salsas extra").</p>}

      {assignFor && (
        <AssignProducts group={assignFor} products={products}
          onClose={() => setAssignFor(null)} onSaved={() => { setAssignFor(null); load(); flash('Productos asignados'); }} onError={setError} />
      )}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-lg font-bold">{toast}</div>}
    </div>
  );
}

function NewGroup({ onSave }) {
  const [name, setName] = useState(''); const [min, setMin] = useState('0'); const [max, setMax] = useState('1'); const [req, setReq] = useState(false);
  return (
    <div className="bg-white rounded-2xl p-4 shadow space-y-2">
      <input placeholder="Nombre del grupo (ej. Presa preferida)" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none" />
      <div className="grid grid-cols-3 gap-2">
        <input type="number" min="0" placeholder="Mín" value={min} onChange={(e) => setMin(e.target.value)} className="px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none" />
        <input type="number" min="0" placeholder="Máx (0=∞)" value={max} onChange={(e) => setMax(e.target.value)} className="px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none" />
        <label className="flex items-center gap-2 px-2 font-bold text-sm"><input type="checkbox" checked={req} onChange={(e) => setReq(e.target.checked)} /> Obligatorio</label>
      </div>
      <button onClick={() => onSave({ name: name.trim(), min_select: Number(min) || 0, max_select: Number(max) || 0, is_required: req })} className="w-full btn-pos bg-cartel text-white">Crear grupo</button>
    </div>
  );
}

function NewOption({ onAdd }) {
  const [name, setName] = useState(''); const [price, setPrice] = useState('');
  return (
    <div className="flex gap-2 mt-2">
      <input placeholder="Nueva opción" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none text-sm" />
      <input type="number" min="0" placeholder="Recargo $" value={price} onChange={(e) => setPrice(e.target.value)} className="w-28 px-3 py-2 rounded-xl border-2 border-zinc-200 outline-none text-sm" />
      <button onClick={() => { if (name.trim()) { onAdd(name.trim(), price); setName(''); setPrice(''); } }} className="px-4 rounded-xl bg-zinc-800 text-white font-bold">+</button>
    </div>
  );
}

function AssignProducts({ group, products, onClose, onSaved, onError }) {
  const [sel, setSel] = useState(new Set(group.product_ids));
  function toggle(id) { setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  async function save() { try { await api(`/modifiers/groups/${group.id}/products`, { method: 'PUT', body: { product_ids: [...sel] } }); onSaved(); } catch (e) { onError(e.message); } }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-20" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-lg mb-3">¿A qué productos aplica "{group.name}"?</h3>
        <div className="space-y-1">
          {products.map((p) => (
            <label key={p.id} className="flex items-center gap-2 py-1">
              <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
              <span className="text-sm">{p.name} <span className="text-zinc-400">· {p.category}</span></span>
            </label>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <button onClick={save} className="flex-1 btn-pos bg-cartel text-white">Guardar</button>
          <button onClick={onClose} className="px-4 rounded-2xl bg-zinc-200 font-bold">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
