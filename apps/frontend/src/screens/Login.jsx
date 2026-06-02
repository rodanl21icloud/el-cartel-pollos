import { useState } from 'react';

export default function Login({ onLogin, notice }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await onLogin(username.trim(), password);
    } catch (err) {
      setError(err.message === 'CREDENCIALES_INVALIDAS' ? 'Usuario o contraseña incorrectos' : 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink p-4 relative overflow-hidden">
      {/* Resplandor de fondo */}
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-cartel/30 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-cartel/20 blur-3xl" />

      <form onSubmit={submit} className="relative bg-white rounded-3xl p-8 w-full max-w-sm shadow-pop animate-[fadein_.3s_ease]">
        <div className="text-center mb-7">
          <img src="/logo.jpeg" alt="El Cartel de los Pollos" className="w-56 mx-auto rounded-xl" />
          <p className="text-ink-mute text-sm mt-3">Sistema de gestión y POS</p>
        </div>
        {notice && <p className="text-center text-sm mb-4 bg-amber-50 text-amber-700 rounded-xl py-2 px-3 font-semibold">{notice}</p>}
        <label className="block text-sm font-bold text-slate-600 mb-1">Usuario</label>
        <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} className="field mb-4 text-lg" />
        <label className="block text-sm font-bold text-slate-600 mb-1">Contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="field mb-4 text-lg" />
        {error && <p className="text-cartel text-sm mb-3 font-semibold">{error}</p>}
        <button disabled={loading} className="w-full btn-pos bg-cartel text-white disabled:opacity-50 hover:bg-cartel-dark">
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
