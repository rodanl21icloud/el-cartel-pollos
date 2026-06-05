// Idempotente: optimización de conversión de la carta digital.
//  - Precios psicológicos (terminación 990/490) en ítems principales.
//  - Descripciones sensoriales.
//  - Estandariza papas a 3 opciones (Individual/Mediano/Familiar); oculta el resto del catálogo.
// Uso:
//   node --env-file=.env            scripts/migrate-carta-conversion.mjs
//   node --env-file=.env.production scripts/migrate-carta-conversion.mjs
import { getDb } from '../src/db.js';
const db = getDb();

// [nombreActualExacto, {price?, description?, name?, in_catalog?}]
const CHANGES = [
  // --- Precios psicológicos (mains: pollo + combos) ---
  ['BROASTER PORCIÓN',              { price: 3990, description: 'Presa de pollo crujiente, dorada y jugosa por dentro.' }],
  ['CUARTO DE POLLO TUTO',          { price: 3990, description: 'Cuarto de tuto a las brasas, jugoso y bien condimentado.' }],
  ['CUARTO DE POLLO PECHUGA',       { price: 4490, description: 'Cuarto de pechuga a las brasas, suave y lleno de sabor.' }],
  ['MEDIO POLLO',                   { price: 7990, description: 'Medio pollo a las brasas, marinado en nuestra receta secreta.' }],
  ['POLLO ENTERO',                  { price: 14990, description: 'Pollo entero a las brasas, dorado y jugoso. El favorito de la familia.' }],
  ['COMBO 1/2 POLLO + PAPAS 400',   { price: 11490, description: 'Medio pollo a las brasas + papas bastón doradas. Ideal para dos.' }],
  ['COMBO POLLO + PAPAS 500',       { price: 18490, description: 'Pollo entero a las brasas + 500g de papas bastón crujientes. ¡El más pedido!' }],
  ['COMBO POLLO + PAPAS 900',       { price: 21490, description: 'Pollo entero + 900g de papas bastón. Para compartir en grande.' }],
  ['COMBO POLLO + PAPAS 1KL',       { price: 21490, description: 'Pollo entero + 1kg de papas bastón crujientes.' }],
  ['COMBO POLLO + PAPAS 900 + BEBIDA 1,5', { price: 23490, description: 'Pollo entero + 900g de papas + bebida 1.5L bien helada.' }],
  ['COMBO POLLO + PAPAS 1 KILO + BEBIDA 1,5LT', { price: 23490, description: 'Pollo entero + 1kg de papas + bebida 1.5L bien helada.' }],
  // Combo con bebida 1.5L: se mantiene en $20.500 (es el upsell del destacado).
  ['COMBO POLLO + PAPAS 500G + BEBIDA 1,5LT', { description: 'Pollo entero + 500g de papas + bebida 1.5L bien helada. ¡Combo completo!' }],

  // --- Papas: estandarizar a 3 opciones claras ---
  ['PAPA 300g', { name: 'Papas Individual (300g)', description: 'Papas bastón doradas y crujientes. Porción individual.' }],
  ['PAPA 500G', { name: 'Papas Mediano (500g)',    description: 'Papas bastón doradas y crujientes. Para compartir.' }],
  ['PAPA 900g',   { name: 'Papas Familiar (1kg)',  description: 'Papas bastón doradas y crujientes. Porción familiar.' }],
  ['PAPA 1 KILO', { name: 'Papas Familiar (1kg)',  description: 'Papas bastón doradas y crujientes. Porción familiar.' }],
  // Ocultar variantes innecesarias del catálogo (siguen activas para el POS).
  ['PAPA 150g',    { in_catalog: 0 }],
  ['PAPA 400g',    { in_catalog: 0 }],
  ['SALCHIPAPAS',  { in_catalog: 0 }],
];

let changed = 0;
for (const [name, fields] of CHANGES) {
  const sets = [], args = [];
  for (const [k, v] of Object.entries(fields)) { sets.push(`${k} = ?`); args.push(v); }
  sets.push(`updated_at = datetime('now')`);
  args.push(name);
  const r = await db.execute({ sql: `UPDATE products SET ${sets.join(', ')} WHERE name = ?`, args });
  if (r.rowsAffected) { changed += r.rowsAffected; console.log(`✓ ${name} →`, fields); }
  else console.log(`· (no encontrado, omito) ${name}`);
}
console.log(`\nListo. ${changed} fila(s) actualizada(s).`);
