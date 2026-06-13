import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { ROLES as ROLE_CATALOG, roleLabel } from '../config/roles.js';
import { humanizeError } from '../components/ui/States.jsx';

const ROLES = ROLE_CATALOG.map((r) => r.key);
const ROLE_HINT = {
  CAJERO: 'Vende, cobra y opera la caja.',
  SUPERVISOR: 'Cajero + anula ventas, registra gastos y ve reportes.',
  PREPARADOR: 'Cocina: despacho, predicción, mermas, inventario y recetas.',
  DESPACHO: 'Tablero de despacho y entregas.',
  GERENCIA: 'Acceso total al negocio.',
  ADMIN: 'Acceso total + permisos y auditoría.',
};
const roleHint = (r) => ROLE_HINT[r] || '';
const roleColor = {
  GERENCIA: 'bg-cartel/10 text-cartel', ADMIN: 'bg-purple-100 text-purple-700',
  SUPERVISOR: 'bg-indigo-100 text-indigo-700', CAJERO: 'bg-blue-100 text-blue-700',
  PREPARADOR: 'bg-amber-100 text-amber-700', DESPACHO: 'bg-teal-100 text-teal-700',
};

// Gestión de usuarios: crear, editar rol/estado, resetear clave.
export default function Usuarios() {
  const [users, setUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [otpInfo, setOtpInfo] = useState(null); // { name, secret }

  async function load() { try { setUsers(await api('/users')); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, []);
  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2500); }
  function handleErr(e) {
    setError(e.message === 'USUARIO_DUPLICADO' ? 'Ese usuario ya existe'
      : e.message === 'ULTIMA_GERENCIA' ? 'No puedes dejar el sistema sin un administrador activo'
      : e.message === 'ROL_NO_DISPONIBLE' ? 'Ese rol aún no está disponible (falta migración de roles)'
      : e.message === 'CLAVE_CORTA' ? 'La clave debe tener al menos 4 caracteres'
      : e.message === 'USUARIO_INVALIDO' ? 'Usuario inválido (mín. 3, solo letras/números)'
      : e.message);
  }

  async function create(body) {
    setError('');
    try {
      const u = await api('/users', { method: 'POST', body });
      setCreating(false); load(); flash('Usuario creado');
      if (u.otp_secret) setOtpInfo({ name: u.full_name, secret: u.otp_secret });
    } catch (e) { handleErr(e); }
  }
  async function update(id, body) {
    setError('');
    try { const r = await api(`/users/${id}`, { method: 'PUT', body }); load(); flash('Actualizado'); if (r.otp_secret) setOtpInfo({ name: r.full_name, secret: r.otp_secret }); }
    catch (e) { handleErr(e); }
  }
  async function resetPass(u) {
    const pass = window.prompt(`Nueva clave para ${u.full_name}:`);
    if (!pass) return;
    setError('');
    try { await api(`/users/${u.id}/password`, { method: 'POST', body: { password: pass } }); flash('Clave actualizada'); }
    catch (e) { handleErr(e); }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-xl">Usuarios</h2>
        <button onClick={() => setCreating(!creating)} className="px-4 py-2 rounded-xl bg-cartel text-white font-bold">{creating ? 'Cancelar' : '+ Nuevo usuario'}</button>
      </div>
      {error && <p className="text-cartel font-semibold">{humanizeError(error)}</p>}
      {creating && <NewUser onSave={create} />}

      <div className="card divide-y">
        {users.map((u) => (
          <div key={u.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-9 h-9 rounded-full grid place-items-center font-black text-sm ${u.is_active ? 'bg-ink text-white' : 'bg-slate-200 text-slate-400'}`}>
                {(u.full_name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-bold">{u.full_name} {!u.is_active && <span className="text-xs text-slate-400">(inactivo)</span>}</div>
                <div className="text-xs text-ink-mute">@{u.username} {u.has_otp && '· 🔐 OTP'}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select value={u.role} onChange={(e) => update(u.id, { role: e.target.value })} className={`text-xs font-bold rounded-lg px-2 py-1.5 ${roleColor[u.role] || 'bg-slate-100'}`}>
                {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
              <button onClick={() => update(u.id, { is_active: !u.is_active })} title={u.is_active ? 'Desactivar' : 'Activar'}
                className={`w-11 h-6 rounded-full relative transition ${u.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${u.is_active ? 'left-[1.4rem]' : 'left-0.5'}`} />
              </button>
              <button onClick={() => resetPass(u)} title="Resetear clave" className="px-2 py-1.5 rounded-lg bg-slate-100 text-sm font-bold">🔑</button>
            </div>
          </div>
        ))}
        {!users.length && <p className="p-4 text-ink-mute">Sin usuarios.</p>}
      </div>

      {otpInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-30" onClick={() => setOtpInfo(null)}>
          <div className="card p-6 max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-3xl mb-2">🔐</div>
            <h3 className="font-black text-lg">OTP de gerencia</h3>
            <p className="text-sm text-ink-mute mb-3">Carga este secreto en Google Authenticator para <b>{otpInfo.name}</b>. No se mostrará de nuevo.</p>
            <div className="bg-slate-100 rounded-xl p-3 font-mono text-lg tracking-widest break-all">{otpInfo.secret}</div>
            <button onClick={() => setOtpInfo(null)} className="w-full btn-pos bg-cartel text-white mt-4">Listo</button>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white px-6 py-3 rounded-full shadow-pop font-bold">{toast}</div>}
    </div>
  );
}

function NewUser({ onSave }) {
  const [f, setF] = useState({ username: '', full_name: '', role: 'CAJERO', password: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card p-4 space-y-2">
      <div className="grid sm:grid-cols-2 gap-2">
        <input placeholder="Nombre completo" value={f.full_name} onChange={set('full_name')} className="field" />
        <input placeholder="Usuario (sin espacios)" value={f.username} onChange={set('username')} className="field" />
        <select value={f.role} onChange={set('role')} className="field">{ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select>
        <input type="password" placeholder="Clave (mín. 4)" value={f.password} onChange={set('password')} className="field" />
      </div>
      <p className="text-xs text-ink-mute px-1">{ROLE_CATALOG.find((r) => r.key === f.role)?.kind === 'ADMIN' ? '🔒 Rol administrador: recibirá un secreto OTP.' : 'Rol operativo.'} {roleHint(f.role)}</p>
      <button onClick={() => onSave({ ...f, username: f.username.trim(), full_name: f.full_name.trim() })} className="w-full btn-pos bg-cartel text-white">Crear usuario</button>
    </div>
  );
}
