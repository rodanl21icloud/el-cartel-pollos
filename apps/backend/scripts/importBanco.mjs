// Importa cartolas bancarias (formato ancho fijo) a bank_movements.
// Clasifica INGRESO/EGRESO y la contraparte/categoría. Idempotente.
// Uso: node --env-file=.env scripts/importBanco.mjs [carpeta] [archivo1.txt ...]
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDb } from '../src/db.js';

const DIR = (process.argv[2] || 'C:/Users/rodri/Downloads/30/').replace(/\\/g, '/').replace(/\/?$/, '/');
const FILES = process.argv.slice(3).length ? process.argv.slice(3)
  : ['01011502.txt', '16023103.txt', '01043004.txt', '01053105.txt'];
const db = getDb();

// Línea de movimiento: cuenta(11) fecha(8) montoZeros + 000 descripción TIPO fecha2 00000
const RE = /^(\d{11})(\d{8})(\d+)\+\d{3}(.*?)\s*([ACS])(\d{8})\d*$/;

function clasificar(desc, dir) {
  const d = desc;
  let counterpart = null;
  let m;
  if ((m = d.match(/Traspaso De:\s*(.+)/i))) counterpart = m[1].trim();
  else if ((m = d.match(/(?:App-)?[Tt]raspaso A:\s*(.+)/i))) counterpart = m[1].trim();
  else if ((m = d.match(/Pago:\s*(.+)/i))) counterpart = m[1].trim();
  const t = d.toLowerCase();
  let category = 'Otros';
  if (/proveedores 0767955618/.test(t)) category = 'Ventas con tarjeta (liquidación)';
  else if (/agrosuper|scarsofy/.test(t)) category = 'Insumos (Agrosuper/Scarsofy)';
  else if (/rj inversiones|inversiones dad|rodrigo nunez itau|rodrigo alejandro nune/.test(t)) category = 'Sociedades / retiros';
  else if (/clean magic|ulises aire|climatizacion|mantenim/.test(t)) category = 'Mantención y servicios';
  else if (dir === 'INGRESO') category = 'Transferencias recibidas';
  else category = 'Otros traspasos';
  return { counterpart, category };
}

let mov = 0, dup = 0, saldo = null, saldoFecha = null;
const seen = new Set();
let stmts = [];
async function flush() { if (stmts.length) { for (const s of stmts) { try { await db.execute(s); mov++; } catch (e) { if (String(e.message).includes('UNIQUE')) dup++; else throw e; } } stmts = []; } }

for (const f of FILES) {
  const full = path.join(DIR, f);
  if (!fs.existsSync(full)) { console.log('No existe:', full); continue; }
  const text = fs.readFileSync(full, 'latin1');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    if (/SALDO CONTABLE/.test(line)) {
      const sm = line.match(/(\d+)\+\d{3}SALDO CONTABLE/);
      const fm = line.match(/^\d{11}(\d{8})/);
      if (sm) { saldo = parseInt(sm[1], 10); if (fm) saldoFecha = `${fm[1].slice(0,4)}-${fm[1].slice(4,6)}-${fm[1].slice(6,8)}`; }
      continue;
    }
    const m = line.match(RE);
    if (!m) continue;
    const [, , d8, amtStr, descRaw, tipo] = m;
    if (tipo === 'S') continue;
    const amount = parseInt(amtStr, 10);
    if (!amount) continue;
    const fecha = `${d8.slice(0,4)}-${d8.slice(4,6)}-${d8.slice(6,8)}`;
    const desc = descRaw.trim();
    // Dirección por el código del banco: A = Abono (ingreso), C = Cargo (egreso).
    // "Pago: Proveedores 0767955618" (A) = liquidación de ventas con tarjeta (ingreso).
    const dir = tipo === 'A' ? 'INGRESO' : 'EGRESO';
    const { counterpart, category } = clasificar(desc, dir);
    const key = `${fecha}|${amount}|${desc}|${tipo}|${dir}`;
    if (seen.has(key)) { dup++; continue; }
    seen.add(key);
    stmts.push({
      sql: `INSERT INTO bank_movements (id, fecha, amount, direction, bank_type, description, counterpart, category, source)
            VALUES (?,?,?,?,?,?,?,?,?)`,
      args: [randomUUID(), fecha, amount, dir, tipo, desc, counterpart, category, f],
    });
    if (stmts.length >= 200) await flush();
  }
}
await flush();

// Asegurar columnas y guardar saldo + datos del negocio.
for (const col of ['instagram TEXT', 'bank_balance REAL', 'bank_balance_date TEXT']) {
  try { await db.execute(`ALTER TABLE business_settings ADD COLUMN ${col}`); } catch { /* ya existe */ }
}
await db.execute({ sql: `INSERT OR IGNORE INTO business_settings (id, name) VALUES (1,'El Cartel de los Pollos')`, args: [] });
await db.execute({
  sql: `UPDATE business_settings SET name='El Cartel de los Pollos', address='Camino Padre Hurtado 18154, San Bernardo',
          phone='+56 9 3720 9677', instagram='@elcarteldelospollos.cl', footer='¡El sabor que manda! Gracias por tu pedido',
          bank_balance=?, bank_balance_date=?, updated_at=datetime('now') WHERE id=1`,
  args: [saldo, saldoFecha],
});

const tot = (await db.execute({ sql: `SELECT direction, COUNT(*) n, COALESCE(SUM(amount),0) t FROM bank_movements GROUP BY direction`, args: [] })).rows;
console.log(`Movimientos insertados: ${mov} · duplicados omitidos: ${dup}`);
tot.forEach(r => console.log(`  ${r.direction}: ${r.n} mov · $${Number(r.t).toLocaleString('es-CL')}`));
if (saldo != null) console.log(`Saldo contable (${saldoFecha}): $${saldo.toLocaleString('es-CL')}`);
