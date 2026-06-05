// ============================================================
// Arquitectura de información (fuente ÚNICA) — Fase 2.
// Navegación por momentos de trabajo: Vender · Cocina · Inventario ·
// Finanzas · Administración. `icon` referencia el set de íconos de
// línea (config/icons.jsx); `perm` habilita el ítem; `kind` separa
// operación de administración. Las claves (key) NO cambian -> ruteo igual.
// ============================================================
export const NAV = [
  {
    section: 'Vender', kind: 'OPERACION', items: [
      { key: 'pos', label: 'Punto de venta', icon: 'cart', perm: 'pos.sell' },
      { key: 'ventas', label: 'Pedidos', icon: 'receipt', perm: 'pos.sell' },
      { key: 'retroactiva', label: 'Venta pasada', icon: 'clock', perm: 'sales.backdate' },
      { key: 'cash', label: 'Caja', icon: 'cash', perm: 'cash.operate' },
      { key: 'clientes', label: 'Clientes', icon: 'users', perm: 'pos.sell' },
    ],
  },
  {
    section: 'Cocina', kind: 'OPERACION', items: [
      { key: 'kds', label: 'Tablero de cocina', icon: 'chef', perm: 'dispatch.manage' },
      { key: 'despacho', label: 'Despacho', icon: 'moto', perm: 'dispatch.manage' },
      { key: 'prediccion', label: 'Plan de horno', icon: 'flame', perm: 'forecast.view' },
      { key: 'merma', label: 'Mermas', icon: 'trash', perm: 'inventory.merma' },
    ],
  },
  {
    section: 'Inventario', kind: 'OPERACION', items: [
      { key: 'inventario', label: 'Stock', icon: 'box', perm: 'inventory.manage' },
      { key: 'carta', label: 'Carta', icon: 'menu', perm: 'menu.manage' },
      { key: 'modificadores', label: 'Modificadores', icon: 'sparkles', perm: 'menu.manage' },
      { key: 'cartelera', label: 'Cartelera', icon: 'tv', perm: 'menu.manage' },
      { key: 'precios', label: 'Precios de compra', icon: 'chart', perm: 'inventory.manage' },
    ],
  },
  {
    section: 'Finanzas', kind: 'OPERACION', items: [
      { key: 'finanzas', label: 'Finanzas', icon: 'pie', perm: 'reports.view' },
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
