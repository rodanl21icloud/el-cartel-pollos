// Conexión única a Turso DB (libSQL).
import { createClient } from '@libsql/client';

let _db = null;

export function getDb() {
  if (_db) return _db;
  _db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return _db;
}
