// Rangos de fecha para los reportes (hora local de Chile, navegador del usuario).
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

export function presetRange(id) {
  const now = new Date();
  let from;
  if (id === 'hoy') from = startOfDay(now);
  else if (id === 'semana') from = startOfDay(new Date(now.getTime() - 6 * 86400000));
  else if (id === 'mes') from = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (id === 'anio') from = new Date(now.getFullYear(), 0, 1);
  else from = startOfDay(new Date(now.getTime() - 29 * 86400000)); // 30 días por defecto
  return { from: from.toISOString(), to: now.toISOString() };
}

export function customRange(fromYmd, toYmd) {
  const from = new Date(`${fromYmd}T00:00:00`);
  const to = new Date(`${toYmd}T23:59:59.999`);
  return { from: from.toISOString(), to: to.toISOString() };
}

export const PRESETS = [
  ['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes'], ['anio', 'Año'], ['custom', 'Personalizado'],
];
