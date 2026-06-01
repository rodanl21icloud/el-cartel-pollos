// Setup de tests: BD aislada en archivo temporal, esquema + usuarios sembrados una vez.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'test.db');

// Variables de entorno ANTES de importar la app/DB.
process.env.NODE_ENV = 'serverless';                 // evita app.listen()
process.env.JWT_SECRET = 'test-secret-0123456789abcdef';
process.env.JWT_TTL = '2h';
process.env.TURSO_DATABASE_URL = 'file:' + DB_PATH.replace(/\\/g, '/');

if (!globalThis.__TEST_INITED__) {
  globalThis.__TEST_INITED__ = true;
  for (const ext of ['', '-wal', '-shm']) { try { fs.rmSync(DB_PATH + ext, { force: true }); } catch { /* */ } }
  const { applySchema, seedUsers } = await import('./helpers.js');
  await applySchema();
  await seedUsers();
}
