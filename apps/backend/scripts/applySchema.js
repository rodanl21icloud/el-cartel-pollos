// Aplica schema.sql y (opcional) seed.sql a la base Turso configurada.
// Uso: node scripts/applySchema.js [--seed]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getDb } from '../src/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..', 'db');

function splitStatements(sql) {
  // Divide respetando bloques de trigger BEGIN...END.
  const out = [];
  let buf = '';
  let inBlock = false;
  for (const raw of sql.split('\n')) {
    const line = raw.replace(/--.*$/, '');
    if (/\bBEGIN\b/i.test(line)) inBlock = true;
    buf += raw + '\n';
    if (inBlock) {
      if (/\bEND\s*;/i.test(line)) { out.push(buf.trim()); buf = ''; inBlock = false; }
    } else if (/;\s*$/.test(line)) {
      out.push(buf.trim()); buf = '';
    }
  }
  return out.filter((s) => s.replace(/;/g, '').trim().length);
}

async function run(file) {
  const sql = readFileSync(join(dbDir, file), 'utf8');
  const db = getDb();
  for (const stmt of splitStatements(sql)) {
    await db.execute(stmt);
  }
  console.log(`Aplicado: ${file}`);
}

await run('schema.sql');
if (process.argv.includes('--seed')) await run('seed.sql');
console.log('Listo.');
