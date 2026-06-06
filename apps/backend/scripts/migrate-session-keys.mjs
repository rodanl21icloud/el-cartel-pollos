// Idempotente — claves de sesión HMAC persistentes (sobreviven a redeploys).
//   node --env-file=.env            scripts/migrate-session-keys.mjs
//   node --env-file=.env.production scripts/migrate-session-keys.mjs
import { getDb } from '../src/db.js';
const db = getDb();
await db.execute(`CREATE TABLE IF NOT EXISTS session_keys (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
)`);
await db.execute(`CREATE INDEX IF NOT EXISTS idx_session_keys_exp ON session_keys(expires_at)`);
console.log('✓ session_keys OK');
