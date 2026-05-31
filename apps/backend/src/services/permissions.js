// ============================================================
// Catálogo de permisos por módulo + lectura/escritura de la matriz
// rol×permiso. Cacheado en memoria (invalidado al actualizar).
// ============================================================
import { getDb } from '../db.js';

// Catálogo de módulos/permisos. La UI lo usa para dibujar la matriz.
export const PERMISSIONS = [
  { key: 'pos.sell',           label: 'Vender en POS',            group: 'Operación' },
  { key: 'dispatch.manage',    label: 'Tablero de despacho',      group: 'Operación' },
  { key: 'expenses.manage',    label: 'Registrar gastos',         group: 'Operación' },
  { key: 'cash.operate',       label: 'Abrir/cerrar caja',        group: 'Operación' },
  { key: 'inventory.merma',    label: 'Registrar mermas',         group: 'Inventario' },
  { key: 'inventory.manage',   label: 'Gestionar insumos',        group: 'Inventario' },
  { key: 'recipes.manage',     label: 'Gestionar recetas',        group: 'Catálogo' },
  { key: 'menu.manage',        label: 'Gestionar carta',          group: 'Catálogo' },
  { key: 'reports.view',       label: 'Ver reportes y P&L',       group: 'Gerencia' },
  { key: 'settings.manage',    label: 'Editar datos del negocio', group: 'Gerencia' },
  { key: 'permissions.manage', label: 'Administrar permisos',     group: 'Gerencia' },
];
const VALID = new Set(PERMISSIONS.map((p) => p.key));

// Defaults por rol (se siembran si la matriz está vacía).
export const DEFAULTS = {
  GERENCIA: PERMISSIONS.map((p) => p.key), // todo
  CAJERO: ['pos.sell', 'dispatch.manage', 'expenses.manage', 'cash.operate', 'inventory.merma'],
  PREPARADOR: ['dispatch.manage', 'inventory.merma'],
};

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
  if (role === 'GERENCIA' && permission === 'permissions.manage') return true; // salvaguarda
  const db = getDb();
  const cache = _cache || (await loadCache(db));
  return !!cache[`${role}:${permission}`];
}

/** Matriz completa para la UI de administración. */
export async function getMatrix() {
  const db = getDb();
  if (!_cache) await loadCache(db);
  const roles = ['CAJERO', 'PREPARADOR', 'GERENCIA'];
  return {
    permissions: PERMISSIONS,
    roles,
    matrix: roles.reduce((acc, role) => {
      acc[role] = PERMISSIONS.reduce((m, p) => { m[p.key] = !!_cache[`${role}:${p.key}`]; return m; }, {});
      return acc;
    }, {}),
  };
}

/** Actualiza una celda (role, permission, allowed). */
export async function setPermission(role, permission, allowed) {
  if (!['CAJERO', 'PREPARADOR', 'GERENCIA'].includes(role)) { const e = new Error('ROL_INVALIDO'); e.status = 400; throw e; }
  if (!VALID.has(permission)) { const e = new Error('PERMISO_INVALIDO'); e.status = 400; throw e; }
  // No permitir que gerencia se quite la administración de permisos (anti-lockout).
  if (role === 'GERENCIA' && permission === 'permissions.manage' && !allowed) {
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
