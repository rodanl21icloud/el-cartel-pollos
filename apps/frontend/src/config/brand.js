// Nombre de marca por instancia. Cada deploy puede fijarlo con la variable de
// build VITE_BRAND_NAME (ej. "El Pollo de la Tía"). Por defecto, El Cartel.
// Único origen de verdad para el branding visible del staff (login + sidebar).
export const BRAND_NAME = (import.meta.env.VITE_BRAND_NAME || 'El Cartel de los Pollos').trim();

// Si es el branding por defecto, se usa el hero estilizado de tres líneas.
export const IS_DEFAULT_BRAND =
  BRAND_NAME.toLowerCase() === 'el cartel de los pollos';

// Parte el nombre en "líneas previas" + "última palabra" (la acentuada).
export function brandLines(name = BRAND_NAME) {
  const words = name.toUpperCase().split(/\s+/).filter(Boolean);
  const last = words.pop() || '';
  return { head: words.join(' '), last };
}

// Logo por instancia: ruta del asset estático o URL absoluta. Lo fija el deploy
// con VITE_BRAND_LOGO (ej. '/logo-pollo-tia.png'). Por defecto, el logo actual.
export const BRAND_LOGO = (import.meta.env.VITE_BRAND_LOGO || '/logo.jpeg').trim();

// URL absoluta del logo (necesaria para el HTML de impresión de boletas/tickets).
export function brandLogoUrl() {
  if (/^https?:\/\//.test(BRAND_LOGO)) return BRAND_LOGO;
  return (typeof window !== 'undefined' ? window.location.origin : '') + BRAND_LOGO;
}
