// Respaldo consistente de la base (snapshot con VACUUM INTO).
// Uso: node --env-file=.env scripts/backup.mjs
// Programar a diario con el Programador de tareas de Windows o cron.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(dir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const out = path.join(dir, `backup-${stamp}.db`).replace(/\\/g, '/');

const db = getDb();
await db.execute(`VACUUM INTO '${out}'`);
const kb = Math.round(fs.statSync(out).size / 1024);
console.log(`Respaldo creado: ${out} (${kb} KB)`);

// Retención: conservar los últimos 14 respaldos.
const files = fs.readdirSync(dir).filter((f) => f.startsWith('backup-') && f.endsWith('.db')).sort();
const sobran = files.slice(0, Math.max(0, files.length - 14));
for (const f of sobran) { fs.unlinkSync(path.join(dir, f)); console.log('Eliminado antiguo:', f); }
console.log(`Respaldos conservados: ${Math.min(files.length, 14)} (retención 14).`);
