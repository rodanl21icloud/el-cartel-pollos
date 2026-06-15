// ============================================================
// Arquitectura de información (fuente ÚNICA) — 7 áreas operativas.
// Hoy (centro de mando, botón Inicio) + 6 secciones agrupadas por flujo real:
// Ventas · Cocina y producción · Inventario y costos · Finanzas ·
// Clientes y campañas · Administración. `icon` -> set de íconos (config/icons.jsx);
// `perm` habilita el ítem; `kind` separa operación de administración.
// Las claves (key) NO cambian -> ruteo y deep-links intactos.
// ============================================================
export const NAV = [
  {
    section: 'Ventas', kind: 'OPERACION', items: [
      { key: 'operaciones', label: 'Centro de Operaciones', icon: 'clipboard', perm: 'cash.operate' },
      { key: 'pos', label: 'Punto de venta', icon: 'cart', perm: 'pos.sell' },
      { key: 'ventas', label: 'Pedidos', icon: 'receipt', perm: 'pos.sell' },
      { key: 'retroactiva', label: 'Venta pasada', icon: 'clock', perm: 'sales.backdate' },
      { key: 'clientes', label: 'Clientes', icon: 'users', perm: 'pos.sell' },
    ],
  },
  {
    section: 'Cocina y producción', kind: 'OPERACION', items: [
      { key: 'kds', label: 'Tablero de cocina', icon: 'chef', perm: 'dispatch.manage' },
      { key: 'despacho', label: 'Despacho', icon: 'moto', perm: 'dispatch.manage' },
      { key: 'prediccion', label: 'Plan de horno', icon: 'flame', perm: 'forecast.view' },
      { key: 'merma', label: 'Mermas', icon: 'trash', perm: 'inventory.merma' },
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
      { key: 'cash', label: 'Caja', icon: 'cash', perm: 'cash.operate' },
      { key: 'cuadre', label: 'Cuadre de turno', icon: 'clock', perm: 'reports.view' },
      { key: 'finanzas', label: 'Finanzas', icon: 'pie', perm: 'reports.view' },
      { key: 'movimientos', label: 'Movimientos', icon: 'receipt', perm: 'reports.view' },
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
// Gerencia/Admin -> Hoy ('/'); Cajero/Supervisor -> Ventas; Cocina/Despacho -> Cocina.
export const ROLE_LANDING = {
  GERENCIA: '/', ADMIN: '/',
  CAJERO: '/pos', SUPERVISOR: '/pos',
  PREPARADOR: '/kds', DESPACHO: '/despacho',
};
