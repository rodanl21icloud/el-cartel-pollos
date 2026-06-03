// Administración de la matriz de permisos (rol × módulo).
import { getMatrix, setPermission, PERMISSIONS } from '../services/permissions.js';
import { writeAudit } from '../services/audit.js';

/** GET /api/permissions — catálogo + matriz actual. */
export async function getPermissions(_req, res) {
  return res.json(await getMatrix());
}

/** GET /api/permissions/me — permisos efectivos del usuario actual (para la UI). */
export async function myPermissions(req, res) {
  const { hasPermission } = await import('../services/permissions.js');
  const out = {};
    if (!req.user) return res.status(401).json({ error: 'NO_AUTH' });
  for (const p of PERMISSIONS) out[p.key] = await hasPermission(req.user.role, p.key);
  return res.json({ role: req.user.role, permissions: out });
}

/** PUT /api/permissions  Body: { role, permission, allowed } */
export async function updatePermission(req, res) {
  const { role, permission, allowed } = req.body || {};
  if (typeof allowed !== 'boolean') return res.status(400).json({ error: 'ALLOWED_BOOLEANO' });
  try {
    await setPermission(role, permission, allowed);
    await writeAudit({
      userId: req.user.id, action: 'PERMISSION_UPDATE', entity: 'role_permissions',
      severity: 'INFO', ip: req.ip, metadata: { role, permission, allowed },
    });
    return res.json({ role, permission, allowed });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
}
