// ============================================================
// Validación y detección de nombres de producto (KAN-28).
// Fuente única usada por: formulario de Carta (validación bloqueante),
// grilla de Venta y catálogo (advertencia no bloqueante).
// ============================================================

export const NOMBRE_ERROR_MSG =
  'El nombre debe ser descriptivo. Mínimo 3 caracteres, no puede empezar con punto, código ni carácter especial.';

// Empieza con letra (acepta tildes/ñ/ü). Cualquier otra cosa (., -, número, símbolo) es inválida.
const EMPIEZA_CON_LETRA = /^[a-záéíóúñü]/i;
// Patrón de "código": mayúsculas pegadas a dígitos, con guion opcional. Ej: UPBEB125, IMP-001, ABC12.
const PATRON_CODIGO = /[A-Z]{2,}-?\d+/;

/**
 * Valida el nombre al CREAR o EDITAR (bloqueante).
 * @returns {string} mensaje de error, o '' si el nombre es válido.
 */
export function validarNombreProducto(raw) {
  const n = String(raw ?? '').trim();
  if (n.length < 3) return NOMBRE_ERROR_MSG;            // vacío, solo espacios o < 3 caracteres
  if (!EMPIEZA_CON_LETRA.test(n)) return NOMBRE_ERROR_MSG; // empieza con punto, guion, número o símbolo
  if (PATRON_CODIGO.test(n)) return NOMBRE_ERROR_MSG;   // contiene patrón de código (UPBEB125, IMP-001)
  return '';
}

/**
 * Detecta un nombre de "código interno" para ADVERTIR (no bloquea).
 * Se usa en la grilla de Venta y en el catálogo para marcar productos
 * existentes que deberían renombrarse, sin impedir venderlos.
 * @returns {boolean}
 */
export function esNombreCodigo(raw) {
  const n = String(raw ?? '').trim();
  return n.startsWith('.') || n.toUpperCase().startsWith('IMP-') || /^[A-Z]{2,}\d+/.test(n);
}
