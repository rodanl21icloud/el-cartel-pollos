// Espejo del catálogo de roles del backend (src/config/roles.js).
// Mantener sincronizado. Fuente única para etiquetas de rol en la UI.
export const ROLES = [
  { key: 'CAJERO', label: 'Cajero', kind: 'OPERACION' },
  { key: 'SUPERVISOR', label: 'Supervisor', kind: 'OPERACION' },
  { key: 'PREPARADOR', label: 'Cocina', kind: 'OPERACION' },
  { key: 'DESPACHO', label: 'Despacho', kind: 'OPERACION' },
  { key: 'GERENCIA', label: 'Gerencia', kind: 'ADMIN' },
  { key: 'ADMIN', label: 'Administrador', kind: 'ADMIN' },
];
export const roleLabel = (k) => ROLES.find((r) => r.key === k)?.label || k;
