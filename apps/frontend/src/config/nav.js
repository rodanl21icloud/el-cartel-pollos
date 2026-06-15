// ============================================================
// Arquitectura de información (fuente ÚNICA) — 7 áreas operativas.
// Hoy (centro de mando) + 6 secciones por flujo real. `perm` habilita el ítem;
// `kind` separa operación de administración. `hidden:true` = deprecado del menú
// (cubierto por una Estación) pero su ruta y guard siguen vivos (compatibilidad
// + deep-links). Las claves (key) NO cambian.
// ============================================================
export const NAV = [
  {
    section: 'Ventas', kind: 'OPERACION', items: [
      { key: 'ventashub', label: '▶ Estación de ventas', icon: 'cart', perm: 'pos.sell' },
      { key: 'operaciones', label: 'Centro de Operaciones', icon: 'clipboard', perm: 'cash.operate', hidden: true },
      { key: 'pos', label: 'Punto de venta', icon: 'cart', perm: 'pos.sell', hidden: true },
      { key: 'ventas', label: 'Pedidos', icon: 'receipt', perm: 'pos.sell', hidden: true },
      { key: 'retroactiva', label: 'Venta pasada', icon: 'clock', perm: 'sales.backdate', hidden: true },
      { key: 'clientes', label: 'Clientes', icon: 'users', perm: 'pos.sell', hidden: true },
    ],
  },
  {
    section: 'Cocina y producción', kind: 'OPERACION', items: [
      { key: 'cocinahub', label: '▶ Estación de cocina', icon: 'chef', perm: 'dispatch.manage' },
      { key: 'kds', label: 'Tablero de cocina', icon: 'chef', perm: 'dispatch.manage', hidden: true },
      { key: 'despacho', label: 'Despacho', icon: 'moto', perm: 'dispatch.manage', hidden: true },
      { key: 'prediccion', label: 'Plan de horno', icon: 'flame', perm: 'forecast.view', hidden: true },
      { key: 'merma', label: 'Mermas', icon: 'trash', perm: 'inventory.merma', hidden: true },
    ],
  },
  {
    section: 'Inventario y costos', kind: 'OPERACION', items: [
      { key: 'inventario', label: 'Stock', icon: 'box', perm: 'inventory.manage' },
      { key: 'carta', label: 'Catálogo y rentabilidad', icon: 'menu', perm: 'menu.manage' },
      { key: 'modificadores', label: 'Modificadores', icon: 'sparkles', perm: 'menu.manage' },
      { key: 'cartelera', label: 'Cartelera', icon: 'tv', perm: 'menu.manage' },
      { key: 'precios', label: 'Precios de compra', icon: 'chart', perm: 'inventory.manage' },
    ],
  },
  {
    section: 'Finanzas', kind: 'OPERACION', items: [
      { key: 'finanzashub', label: '▶ Estación de finanzas', icon: 'cash', perm: 'cash.operate' },
      { key: 'cash', label: 'Caja', icon: 'cash', perm: 'cash.operate', hidden: true },
      { key: 'cuadre', label: 'Cuadre de turno', icon: 'clock', perm: 'reports.view', hidden: true },
      { key: 'finanzas', label: 'Finanzas', icon: 'pie', perm: 'reports.view', hidden: true },
      { key: 'movimientos', label: 'Movimientos', icon: 'receipt', perm: 'reports.view', hidden: true },
    ],
  },
  {
    section: 'Clientes y campañas', kind: 'OPERACION', items: [
      { key: 'comercial', label: 'Comercial', icon: 'sparkles', perm: 'reports.view' },
      { key: 'winback', label: 'Recuperar clientes', icon: 'users', perm: 'reports.view' },
    ],
  },
  {
    section: 'Administración', kind: 'ADMIN', items: [
      { key: 'ajustes', label: 'Negocio', icon: 'store', perm: 'settings.manage' },
      { key: 'usuarios', label: 'Usuarios', icon: 'user', perm: 'permissions.manage' },
      { key: 'permisos', label: 'Roles y permisos', icon: 'shield', perm: 'permissions.manage' },
      { key: 'auditoria', label: 'Auditoría', icon: 'clipboard', perm: 'audit.view' },
    ],
  },
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items);
export const itemByKey = (key) => ALL_ITEMS.find((i) => i.key === key);

// Landing por rol: a qué área entra cada perfil al iniciar sesión.
export const ROLE_LANDING = {
  GERENCIA: '/', ADMIN: '/',
  CAJERO: '/pos', SUPERVISOR: '/pos',
  PREPARADOR: '/kds', DESPACHO: '/despacho',
};
