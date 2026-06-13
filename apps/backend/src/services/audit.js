// Escritura en audit_logs (append-only) con CADENA ANTIFRAUDE.
// Cada fila guarda prev_hash (record_hash de la anterior) y record_hash =
// HMAC-SHA256(AUDIT_CHAIN_SECRET, contenido_canónico + '|' + prev_hash).
// El HMAC con secreto de servidor hace la cadena tamper-evident Y no falsificable:
// editar/borrar/insertar filas a nivel de archivo rompe la verificación.
//
// Concurrencia: TODA escritura (suelta o dentro de un batch) se serializa con un
// mutex in-process (la app corre 1 web service por local -> suficiente). El orden
// de la cadena usa el rowid implícito de SQLite (monotónico por inserción).
//
// Dos APIs:
//   appendAudit(fields)                 -> inserción suelta (alias: writeAudit).
//   commitWithAudit(stmts, fields, mode)-> añade el/los audit encadenados al MISMO
//                                          batch atómico del caller y lo ejecuta.
import crypto, { randomUUID } from 'node:crypto';
import { getDb } from '../db.js';

const GENESIS = '0'.repeat(64);
const SECRET = process.env.AUDIT_CHAIN_SECRET || process.env.JWT_SECRET || 'cartel-audit-chain-dev';

function canonical(r) {
  return [
    r.id, r.user_id ?? '', r.action, r.entity, r.entity_id ?? '',
    r.severity, r.metadata ?? '', r.ip_address ?? '', r.created_at,
  ].join('|');
}
function recordHash(r, prev) {
  return crypto.createHmac('sha256', SECRET).update(canonical(r) + '|' + prev).digest('hex');
}

// Construye N inserts encadenados (cada uno referencia el record_hash del anterior).
async function buildChainedInserts(db, list) {
  const last = (await db.execute(`SELECT record_hash FROM audit_logs ORDER BY rowid DESC LIMIT 1`)).rows[0];
  let prev = (last && last.record_hash) ? last.record_hash : GENESIS;
  const out = [];
  for (const f of list) {
    const row = {
      id: randomUUID(), user_id: f.userId ?? null, action: f.action, entity: f.entity,
      entity_id: f.entityId ?? null, severity: f.severity || 'INFO',
      metadata: f.metadata ? JSON.stringify(f.metadata) : null, ip_address: f.ip ?? null,
      created_at: new Date().toISOString(),
    };
    const record = recordHash(row, prev);
    out.push({
      sql: `INSERT INTO audit_logs
              (id, user_id, action, entity, entity_id, severity, metadata, ip_address, created_at, prev_hash, record_hash)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      args: [row.id, row.user_id, row.action, row.entity, row.entity_id, row.severity,
             row.metadata, row.ip_address, row.created_at, prev, record],
      id: row.id,
    });
    prev = record;
  }
  return out;
}

// Mutex: cadena de promesas. Garantiza lectura-de-último + inserción sin solaparse.
let _gate = Promise.resolve();
function _serialize(work) {
  const run = _gate.then(work);
  _gate = run.then(() => {}, () => {}); // la cadena de promesas no se rompe si una falla
  return run;
}

/** appendAudit — inserción suelta encadenada. Misma firma que el antiguo writeAudit. */
export function appendAudit(fields) {
  return _serialize(async () => {
    const db = getDb();
    const [ins] = await buildChainedInserts(db, [fields]);
    await db.execute({ sql: ins.sql, args: ins.args });
    return ins.id;
  });
}

/**
 * commitWithAudit — añade el/los audit encadenados al batch `stmts` del caller y
 * ejecuta db.batch atómico bajo el mutex (atomicidad financiera + cadena completa).
 * `fields` puede ser un objeto o un array (varios eventos en la misma transacción).
 */
export function commitWithAudit(stmts, fields, mode = 'write') {
  const list = Array.isArray(fields) ? fields : [fields];
  return _serialize(async () => {
    const db = getDb();
    const inserts = await buildChainedInserts(db, list);
    return db.batch([...stmts, ...inserts.map((i) => ({ sql: i.sql, args: i.args }))], mode);
  });
}

// Alias retrocompatible: los 23 call sites existentes quedan encadenados sin cambios.
export const writeAudit = appendAudit;

/**
 * verifyAuditChain — recorre la cadena (filas con record_hash) desde el génesis,
 * recomputa cada hash y detecta el primer eslabón roto (edición/borrado/inserción).
 */
export async function verifyAuditChain() {
  const db = getDb();
  const rows = (await db.execute(
    `SELECT id, user_id, action, entity, entity_id, severity, metadata, ip_address, created_at, prev_hash, record_hash
     FROM audit_logs WHERE record_hash IS NOT NULL ORDER BY rowid ASC`
  )).rows;
  let prev = GENESIS;
  for (const r of rows) {
    if ((r.prev_hash || '') !== prev) {
      return { ok: false, broken_at: r.id, created_at: r.created_at,
               reason: 'prev_hash no encadena: fila insertada o borrada antes de esta' };
    }
    if (recordHash(r, r.prev_hash) !== r.record_hash) {
      return { ok: false, broken_at: r.id, created_at: r.created_at,
               reason: 'record_hash no coincide: fila editada' };
    }
    prev = r.record_hash;
  }
  return { ok: true, verified: rows.length };
}
