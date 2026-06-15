import { useState } from 'react';

// Estación de trabajo: shell con tabs que monta pantallas existentes como
// secciones internas. Cada tab declara su `perm`; se ocultan los no permitidos.
// No cambia lógica: solo agrupa el flujo para reducir cambios de pantalla.
export default function Station({ tabs, perms }) {
  const visible = tabs.filter((t) => !t.perm || perms?.[t.perm]);
  const [active, setActive] = useState(visible[0]?.key);
  const cur = visible.find((t) => t.key === active) || visible[0];

  if (!visible.length) {
    return <p className="text-ink-mute text-center mt-10">No tienes acceso a esta estación.</p>;
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex gap-1 overflow-x-auto mb-4 border-b border-zinc-200">
        {visible.map((t) => (
          <button key={t.key} onClick={() => setActive(t.key)}
            className={`px-4 py-2 font-bold whitespace-nowrap border-b-2 -mb-px transition ${
              cur?.key === t.key ? 'border-cartel text-cartel' : 'border-transparent text-ink-mute hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div>{cur?.render()}</div>
    </div>
  );
}
