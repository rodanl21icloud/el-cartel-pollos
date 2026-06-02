// ============================================================
// Catálogo ÚNICO de roles del sistema (fuente de verdad).
// No hardcodear roles en otros archivos: importar desde aquí.
// `kind` separa operación de administración para la UI/IA.
// ============================================================
export const ROLES = [
  { key: 'CAJERO',     label: 'Cajero',        kind: 'OPERACION', desc: 'Vende y cobra. Opera su caja.' },
  { key: 'SUPERVISOR', label: 'Supervisor',    kind: 'OPERACION', desc: 'Cajero + aprueba anulaciones/descuentos y ve reportes operativos.' },
  { key: 'PREPARADOR', label: 'Cocina',        kind: 'OPERACION', desc: 'Producción: despacho, predicción de horno, mermas, inventario y recetas.' },
  { key: 'DESPACHO',   label: 'Despacho',      kind: 'OPERACION', desc: 'Gestiona el tablero de despacho y la entrega.' },
  { key: 'GERENCIA',   label: 'Gerencia',      kind: 'ADMIN',     desc: 'Dueño/a del negocio: finanzas, catálogo, usuarios y configuración.' },
  { key: 'ADMIN',      label: 'Administrador', kind: 'ADMIN',     desc: 'Administrador del sistema: todos los permisos, incluida la matriz de permisos y la auditoría.' },
];

export const ROLE_KEYS = ROLES.map((r) => r.key);
export const isRole = (k) => ROLE_KEYS.includes(k);
export const roleLabel = (k) => ROLES.find((r) => r.key === k)?.label || k;
