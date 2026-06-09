import db from '../db.js';

export async function saveSessionKey(clientUuid, hmacKey) {
  await db.execute({
    sql: INSERT INTO session_keys (client_uuid, hmac_key) 
          VALUES (?, ?) 
          ON CONFLICT(client_uuid) 
          DO UPDATE SET hmac_key = excluded.hmac_key, created_at = CURRENT_TIMESTAMP,
    args: [clientUuid, hmacKey]
  });
}

export async function getSessionKey(clientUuid) {
  const result = await db.execute({
    sql: 'SELECT hmac_key FROM session_keys WHERE client_uuid = ?',
    args: [clientUuid]
  });
  
  if (result.rows.length === 0) return null;
  return result.rows[0].hmac_key;
}

export async function deleteSessionKey(clientUuid) {
  await db.execute({
    sql: 'DELETE FROM session_keys WHERE client_uuid = ?',
    args: [clientUuid]
  });
}
