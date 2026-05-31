import { useState } from 'react';

export default function Login({ onLogin }) {
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
    <div className="min-h-screen flex items-center justify-center bg-zinc-900 p-4">
      <form onSubmit={submit} className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-5xl">🐔</div>
          <h1 className="text-2xl font-black text-cartel mt-2">El Cartel de los Pollos</h1>
          <p className="text-zinc-500 text-sm">Punto de Venta</p>
        </div>
        <label className="block text-sm font-bold text-zinc-700">Usuario</label>
        <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)}
          className="w-full mt-1 mb-4 px-4 py-3 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-lg" />
        <label className="block text-sm font-bold text-zinc-700">Contraseña</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full mt-1 mb-4 px-4 py-3 rounded-xl border-2 border-zinc-200 focus:border-cartel outline-none text-lg" />
        {error && <p className="text-red-600 text-sm mb-3 font-semibold">{error}</p>}
        <button disabled={loading}
          className="w-full btn-pos bg-cartel text-white disabled:opacity-50">
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
