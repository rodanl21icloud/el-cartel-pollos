// Avatares visuales por categoría para productos sin imagen propia.
// Usado en la grilla de Venta (Pos.jsx), Carta.jsx y la cartelera de TV.
//
// Imágenes seleccionadas con criterio de neuromarketing QSR: fondo oscuro,
// composición centrada, tono dorado/ámbar (activa apetito), sin texto.
// Todas verificadas (HTTP 200, image/jpeg) contra la CDN de Unsplash.

export const CATEGORY_ASSETS = {
  POLLO: {
    emoji: '🍗',
    gradient: 'from-orange-500 to-red-600',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    // Pollo ENTERO asado dorado con hierbas. Icónico para "pollos a las brasas".
    // (La URL original 1598103442097 quedó 404 en Unsplash; reemplazada.)
    image: 'https://images.unsplash.com/photo-1594221708779-94832f4320d1?w=800&q=85',
  },
  COMBOS: {
    emoji: '🥡',
    gradient: 'from-yellow-500 to-orange-500',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    // Pollo frito dorado en canasta, fondo oscuro de madera. Máximo contraste.
    // (La URL propuesta 1598866594240 daba 404; reemplazada por esta verificada.)
    image: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=800&q=85',
  },
  COLACIONES: {
    emoji: '🥗',
    gradient: 'from-green-500 to-emerald-600',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    // Presas de pollo glaseadas en tabla oscura con salsa, close-up apetitoso.
    image: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=800&q=85',
  },
  PAPAS: {
    emoji: '🍟',
    gradient: 'from-yellow-400 to-amber-500',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    // Papas fritas doradas con kétchup. El ámbar/naranja es el color que más
    // activa el apetito. By Louis Hansel (fotógrafo gastronómico profesional).
    image: 'https://images.unsplash.com/photo-1518013431117-eb1465fa5752?w=800&q=85',
  },
  SNACKS: {
    emoji: '🍿',
    gradient: 'from-amber-500 to-yellow-600',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    // Snack apetitoso, fondo oscuro. (Solo se usa como fondo sutil de header.)
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=800&q=85',
  },
  BEBIDAS: {
    emoji: '🥤',
    gradient: 'from-blue-500 to-cyan-600',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    // Bebidas frías con hielo, tono dorado/cítrico. Refresca y contrasta.
    image: 'https://images.unsplash.com/photo-1546173159-315724a31696?w=800&q=85',
  },
  DEFAULT: {
    emoji: '🍽️',
    gradient: 'from-gray-500 to-zinc-600',
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-700',
    image: null,
  },
};

export function getCategoryAsset(categoria) {
  if (!categoria) return CATEGORY_ASSETS.DEFAULT;
  const key = categoria.toUpperCase().trim();
  return CATEGORY_ASSETS[key] || CATEGORY_ASSETS.DEFAULT;
}
