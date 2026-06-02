// ============================================================
// Catálogo de permisos por módulo + lectura/escritura de la matriz
// rol×permiso. Cacheado en memoria (invalidado al actualizar).
// ============================================================
import { getDb } from '../db.js';
import { ROLES, ROLE_KEYS } from '../config/roles.js';

// Catálogo de módulos/permisos. La UI lo usa para dibujar la matriz.
// `group` agrupa por área para la pantalla de Roles y permisos.
export const PERMISSIONS = [
  { key: 'pos.sell',           label: 'Vender en POS',            group: 'Operación' },
  { key: 'sales.void',         label: 'Anular ventas',            group: 'Operación' },
  { key: 'sales.backdate',     label: 'Registrar ventas retroactivas', group: 'Operación' },
  { key: 'cash.operate',       label: 'Abrir/cerrar caja',        group: 'Operación' },
  { key: 'dispatch.manage',    label: 'Tablero de despacho',      group: 'Operación' },
  { key: 'forecast.view',      label: 'Ver predicción de horno',  group: 'Operación' },
  { key: 'expenses.manage',    label: 'Registrar gastos',         group: 'Operación' },
  { key: 'inventory.merma',    label: 'Registrar mermas',         group: 'Inventario' },
  { key: 'inventory.manage',   label: 'Gestionar insumos',        group: 'Inventario' },
  { key: 'recipes.manage',     label: 'Gestionar recetas',        group: 'Catálogo' },
  { key: 'menu.manage',        label: 'Gestionar carta',          group: 'Catálogo' },
  { key: 'reports.view',       label: 'Ver reportes y P&L',       group: 'Finanzas' },
  { key: 'settings.manage',    label: 'Editar datos del negocio', group: 'Administración' },
  { key: 'audit.view',         label: 'Ver auditoría/actividad',  group: 'Administración' },
  { key: 'permissions.manage', label: 'Administrar permisos',     group: 'Administración' },
];
const VALID = new Set(PERMISSIONS.map((p) => p.key));
const ALL = PERMISSIONS.map((p) => p.key);

// Defaults por rol (least-privilege). Se siembran si la matriz está vacía
// y se completan al agregar roles/permisos vía scripts/migrate-perms.mjs.
export const DEFAULTS = {
  CAJERO:     ['pos.sell', 'cash.operate', 'dispatch.manage', 'forecast.view', 'inventory.merma'],
  SUPERVISOR: ['pos.sell', 'cash.operate', 'dispatch.manage', 'forecast.view', 'inventory.merma', 'sales.void', 'expenses.manage', 'reports.view'],
  PREPARADOR: ['dispatch.manage', 'forecast.view', 'inventory.merma', 'inventory.manage', 'recipes.manage'],
  DESPACHO:   ['dispatch.manage', 'forecast.view'],
  GERENCIA:   ALL, // dueño/a: todo el negocio
  ADMIN:      ALL, // administrador del sistema: todo
};
// Roles que conservan la administración de permisos pase lo que pase (anti-lockout).
const SUPERADMINS = new Set(['GERENCIA', 'ADMIN']);

let _cache = null; // { 'ROLE:perm': true }

async function loadCache(db) {
  const { rows } = await db.execute({ sql: `SELECT role, permission, allowed FROM role_permissions`, args: [] });
  // Si está vacía, sembrar defaults.
  if (!rows.length) {
    await seedDefaults(db);
    return loadCache(db);
  }
  _cache = {};
  for (const r of rows) if (r.allowed) _cache[`${r.role}:${r.permission}`] = true;
  return _cache;
}

async function seedDefaults(db) {
  const stmts = [];
  for (const [role, keys] of Object.entries(DEFAULTS)) {
    for (const key of VALID) {
      stmts.push({
        sql: `INSERT OR IGNORE INTO role_permissions (role, permission, allowed) VALUES (?,?,?)`,
        args: [role, key, keys.includes(key) ? 1 : 0],
      });
    }
  }
  await db.batch(stmts, 'write');
}

export function invalidateCache() { _cache = null; }

/** ¿El rol tiene el permiso? */
export async function hasPermission(role, permission) {
  // Salvaguarda: gerencia/admin nunca pierden la administración de permisos.
  if (SUPERADMINS.has(role) && permission === 'permissions.manage') return true;
  const db = getDb();
  const cache = _cache || (await loadCache(db));
  return !!cache[`${role}:${permission}`];
}

/** Matriz completa para la UI de administración (data-driven desde el catálogo). */
export async function getMatrix() {
  const db = getDb();
  if (!_cache) await loadCache(db);
  return {
    permissions: PERMISSIONS,
    roles: ROLE_KEYS,
    role_meta: ROLES,
    matrix: ROLE_KEYS.reduce((acc, role) => {
      acc[role] = PERMISSIONS.reduce((m, p) => {
        m[p.key] = (SUPERADMINS.has(role) && p.key === 'permissions.manage') || !!_cache[`${role}:${p.key}`];
        return m;
      }, {});
      return acc;
    }, {}),
  };
}

/** Actualiza una celda (role, permission, allowed). */
export async function setPermission(role, permission, allowed) {
  if (!ROLE_KEYS.includes(role)) { const e = new Error('ROL_INVALIDO'); e.status = 400; throw e; }
  if (!VALID.has(permission)) { const e = new Error('PERMISO_INVALIDO'); e.status = 400; throw e; }
  // No permitir que gerencia/admin se quiten la administración de permisos (anti-lockout).
  if (SUPERADMINS.has(role) && permission === 'permissions.manage' && !allowed) {
    const e = new Error('NO_PUEDES_BLOQUEAR_GERENCIA'); e.status = 409; throw e;
  }
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO role_permissions (role, permission, allowed) VALUES (?,?,?)
          ON CONFLICT(role, permission) DO UPDATE SET allowed = excluded.allowed`,
    args: [role, permission, allowed ? 1 : 0],
  });
  invalidateCache();
}
