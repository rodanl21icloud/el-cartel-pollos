// Escritura en audit_logs (append-only). Nunca actualiza ni borra.
import { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';

export async function writeAudit({
  userId = null,
  action,
  entity,
  entityId = null,
  severity = 'INFO',
  metadata = null,
  ip = null,
}) {
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO audit_logs
            (id, user_id, action, entity, entity_id, severity, metadata, ip_address)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [
      randomUUID(),
      userId,
      action,
      entity,
      entityId,
      severity,
      metadata ? JSON.stringify(metadata) : null,
      ip,
    ],
  });
}
