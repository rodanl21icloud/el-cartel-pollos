// ============================================================
// Arquitectura de información (fuente ÚNICA). Orientada a tareas:
// Operación → Catálogo → Finanzas → Clientes → Administración.
// Cada ítem declara el permiso que lo habilita; la UI filtra por permiso.
// `kind` separa visualmente operación de administración.
// ============================================================
export const NAV = [
  {
    section: 'Operación', kind: 'OPERACION', items: [
      { key: 'pos', label: 'Vender', icon: '🛒', perm: 'pos.sell' },
      { key: 'ventas', label: 'Ventas', icon: '🧾', perm: 'pos.sell' },
      { key: 'retroactiva', label: 'Venta retroactiva', icon: '🕓', perm: 'sales.backdate' },
      { key: 'cash', label: 'Caja', icon: '💵', perm: 'cash.operate' },
      { key: 'despacho', label: 'Despacho', icon: '🛵', perm: 'dispatch.manage' },
      { key: 'kds', label: 'Cocina (KDS)', icon: '👨‍🍳', perm: 'dispatch.manage' },
      { key: 'prediccion', label: 'Predicción horno', icon: '🔮', perm: 'forecast.view' },
      { key: 'merma', label: 'Mermas', icon: '🗑️', perm: 'inventory.merma' },
    ],
  },
  {
    section: 'Catálogo', kind: 'OPERACION', items: [
      { key: 'carta', label: 'Carta', icon: '🍗', perm: 'menu.manage' },
      { key: 'cartelera', label: 'Cartelera', icon: '📋', perm: 'menu.manage' },
      { key: 'modificadores', label: 'Modificadores', icon: '✨', perm: 'menu.manage' },
      { key: 'inventario', label: 'Inventario', icon: '📦', perm: 'inventory.manage' },
    ],
  },
  {
    section: 'Finanzas', kind: 'OPERACION', items: [
      { key: 'resumen', label: 'Resumen', icon: '📋', perm: 'reports.view' },
      { key: 'cuadre', label: 'Cuadre de turno', icon: '🐔', perm: 'reports.view' },
      { key: 'movimientos', label: 'Movimientos', icon: '💱', perm: 'reports.view' },
      { key: 'gastos', label: 'Gastos', icon: '💸', perm: 'expenses.manage' },
      { key: 'flujo', label: 'Flujo de caja', icon: '📈', perm: 'reports.view' },
      { key: 'banco', label: 'Banco', icon: '🏦', perm: 'reports.view' },
      { key: 'pnl', label: 'P&L', icon: '🧮', perm: 'reports.view' },
      { key: 'estadisticas', label: 'Estadísticas', icon: '📊', perm: 'reports.view' },
    ],
  },
  {
    section: 'Clientes', kind: 'OPERACION', items: [
      { key: 'clientes', label: 'Clientes', icon: '👥', perm: 'pos.sell' },
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
