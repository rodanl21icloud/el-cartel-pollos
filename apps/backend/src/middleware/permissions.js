// Middleware: exige un permiso de módulo según la matriz rol×permiso.
import { hasPermission } from '../services/permissions.js';
import { writeAudit } from '../services/audit.js';

export function requirePermission(permission) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'NO_AUTENTICADO' });
    if (await hasPermission(req.user.role, permission)) return next();
    await writeAudit({
      userId: req.user.id, action: 'PERMISSION_DENIED', entity: permission,
      severity: 'WARN', ip: req.ip, metadata: { role: req.user.role },
    });
    return res.status(403).json({ error: 'PERMISO_DENEGADO', permission });
  };
}
