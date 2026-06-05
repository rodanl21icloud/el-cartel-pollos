// ============================================================
// Arquitectura de información (fuente ÚNICA) — Fase 1 (versión ambiciosa).
// Navegación por MOMENTOS DE TRABAJO, no por estructura del negocio:
//   Vender · Cocina · Inventario · Finanzas · Administración.
// Cada ítem declara el permiso que lo habilita; la UI filtra por permiso.
// `kind` separa visualmente operación de administración.
// NOTA: las claves (key) y permisos NO cambian -> el ruteo de App.jsx sigue igual;
// esta capa solo reorganiza, reordena y renombra.
// ============================================================
export const NAV = [
  {
    section: 'Vender', kind: 'OPERACION', items: [
      { key: 'pos', label: 'Punto de venta', icon: '🛒', perm: 'pos.sell' },
      { key: 'ventas', label: 'Pedidos', icon: '🧾', perm: 'pos.sell' },
      { key: 'retroactiva', label: 'Venta pasada', icon: '🕓', perm: 'sales.backdate' },
      { key: 'cash', label: 'Caja', icon: '💵', perm: 'cash.operate' },
      { key: 'clientes', label: 'Clientes', icon: '👥', perm: 'pos.sell' },
    ],
  },
  {
    section: 'Cocina', kind: 'OPERACION', items: [
      { key: 'kds', label: 'Tablero de cocina', icon: '👨‍🍳', perm: 'dispatch.manage' },
      { key: 'despacho', label: 'Despacho', icon: '🛵', perm: 'dispatch.manage' },
      { key: 'prediccion', label: 'Plan de horno', icon: '🔮', perm: 'forecast.view' },
      { key: 'merma', label: 'Mermas', icon: '🗑️', perm: 'inventory.merma' },
    ],
  },
  {
    section: 'Inventario', kind: 'OPERACION', items: [
      { key: 'inventario', label: 'Stock', icon: '📦', perm: 'inventory.manage' },
      { key: 'carta', label: 'Carta', icon: '🍗', perm: 'menu.manage' },
      { key: 'modificadores', label: 'Modificadores', icon: '✨', perm: 'menu.manage' },
      { key: 'cartelera', label: 'Cartelera', icon: '📋', perm: 'menu.manage' },
      { key: 'precios', label: 'Compras', icon: '📈', perm: 'inventory.manage' },
    ],
  },
  {
    section: 'Finanzas', kind: 'OPERACION', items: [
      { key: 'finanzas', label: 'Finanzas', icon: '📊', perm: 'reports.view' },
    ],
  },
  {
    section: 'Administración', kind: 'ADMIN', items: [
      { key: 'ajustes', label: 'Negocio', icon: '🏪', perm: 'settings.manage' },
      { key: 'usuarios', label: 'Usuarios', icon: '👤', perm: 'permissions.manage' },
      { key: 'permisos', label: 'Roles y permisos', icon: '🔐', perm: 'permissions.manage' },
      { key: 'auditoria', label: 'Auditoría', icon: '🛡️', perm: 'audit.view' },
    ],
  },
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items);
export const itemByKey = (key) => ALL_ITEMS.find((i) => i.key === key);
