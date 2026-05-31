import { Fragment, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Matriz rol × módulo. Gerencia activa/desactiva el acceso de cada rol.
export default function Permisos() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  async function load() {
    try { setData(await api('/permissions')); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function toggle(role, permission, current) {
    setError(''); setSaving(`${role}:${permission}`);
    try {
      await api('/permissions', { method: 'PUT', body: { role, permission, allowed: !current } });
      setData((d) => ({
        ...d,
        matrix: { ...d.matrix, [role]: { ...d.matrix[role], [permission]: !current } },
      }));
    } catch (e) {
      setError(e.message === 'NO_PUEDES_BLOQUEAR_GERENCIA'
        ? 'No puedes quitarle a gerencia la administración de permisos'
        : e.message);
    }
    setSaving('');
  }

  if (error && !data) return <p className="text-red-600 text-center mt-10">{error}</p>;
  if (!data) return <p className="text-zinc-500 text-center mt-10">Cargando permisos…</p>;

  // Agrupar permisos por "group" para legibilidad.
  const groups = {};
  for (const p of data.permissions) (groups[p.group] ??= []).push(p);

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-2xl p-5 shadow">
      <h2 className="font-black text-xl mb-1">Permisos por módulo</h2>
      <p className="text-sm text-zinc-500 mb-4">Activa qué puede hacer cada rol. Los cambios aplican de inmediato.</p>
      {error && <p className="text-red-600 font-semibold mb-3">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Módulo</th>
              {data.roles.map((r) => <th key={r} className="text-center px-2">{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([group, perms]) => (
              <Fragment key={group}>
                <tr className="bg-zinc-50">
                  <td colSpan={data.roles.length + 1} className="py-1 px-2 font-bold text-zinc-500 text-xs uppercase tracking-wide">{group}</td>
                </tr>
                {perms.map((p) => (
                  <tr key={p.key} className="border-b last:border-0">
                    <td className="py-2 font-semibold">{p.label}</td>
                    {data.roles.map((role) => {
                      const on = data.matrix[role][p.key];
                      const busy = saving === `${role}:${p.key}`;
                      return (
                        <td key={role} className="text-center px-2">
                          <button onClick={() => toggle(role, p.key, on)} disabled={busy}
                            className={`w-10 h-7 rounded-full transition relative ${on ? 'bg-green-500' : 'bg-zinc-300'} ${busy ? 'opacity-50' : ''}`}
                            aria-pressed={on}>
                            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
