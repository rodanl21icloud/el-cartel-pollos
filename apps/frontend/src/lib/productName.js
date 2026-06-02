// ============================================================
// Validación y detección de nombres de producto (KAN-28).
// Fuente única usada por: formulario de Carta (validación bloqueante),
// grilla de Venta y catálogo (advertencia).
//
// Regla (spec oficial KAN-28):
//   - mínimo 3 caracteres (sin contar espacios al inicio/fin)
//   - no puede empezar con punto ni carácter especial (debe empezar con
//     letra —incluye tildes/ñ/ü— o dígito)
// No se restringe el resto del nombre (permite "+", "/", "," etc., p. ej.
// "COMBO POLLO + PAPAS 900").
// ============================================================

export const NOMBRE_ERROR_MSG =
  'El nombre debe ser descriptivo (mín. 3 caracteres, sin caracteres especiales al inicio)';

// El primer carácter NO debe ser un carácter no alfanumérico (., @, #, -, _, etc.).
const EMPIEZA_CON_ESPECIAL = /^[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9]/;

/**
 * Valida el nombre al CREAR o EDITAR (bloqueante).
 * @returns {string} mensaje de error, o '' si el nombre es válido.
 */
export function validarNombreProducto(raw) {
  const n = String(raw ?? '').trim();
  if (n.length < 3) return NOMBRE_ERROR_MSG;                 // vacío, solo espacios o < 3 caracteres
  if (EMPIEZA_CON_ESPECIAL.test(n)) return NOMBRE_ERROR_MSG; // empieza con punto o carácter especial
  return '';
}

/**
 * Detecta un nombre inválido para ADVERTIR (grilla de Venta y catálogo).
 * Mismo criterio que la validación: empieza con punto/especial o < 3 chars.
 * No bloquea la venta del producto existente, solo lo marca visualmente.
 * @returns {boolean}
 */
export function esNombreInvalido(raw) {
  return validarNombreProducto(raw) !== '';
}
