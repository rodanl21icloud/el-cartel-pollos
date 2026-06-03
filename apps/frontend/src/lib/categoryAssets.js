// Avatares visuales por categoria para productos sin imagen propia
// Usado en la grilla de Venta (Pos.jsx) y en Carta.jsx

export const CATEGORY_ASSETS = {
  POLLO: {
    emoji: '🍗',
    gradient: 'from-orange-500 to-red-600',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-700',
    image: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c8?w=400&q=80',
  },
  COMBOS: {
    emoji: '🍱',
    gradient: 'from-yellow-500 to-orange-500',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-700',
    image: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=400&q=80',
  },
  COLACIONES: {
    emoji: '🥗',
    gradient: 'from-green-500 to-emerald-600',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80',
  },
  PAPAS: {
    emoji: '🍟',
    gradient: 'from-yellow-400 to-yellow-600',
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-800',
    image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&q=80',
  },
  SNACKS: {
    emoji: '🥨',
    gradient: 'from-amber-400 to-orange-500',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
    image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&q=80',
  },
  BEBIDAS: {
    emoji: '🥤',
    gradient: 'from-blue-400 to-cyan-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    image: 'https://images.unsplash.com/photo-1603394151492-9b07e5c43b7f?w=400&q=80',
  },
  DEFAULT: {
    emoji: '🍽️',
    gradient: 'from-zinc-400 to-zinc-600',
    bgColor: 'bg-zinc-50',
    textColor: 'text-zinc-700',
    image: null,
  },
};

export function getCategoryAsset(categoria) {
  if (!categoria) return CATEGORY_ASSETS.DEFAULT;
  const key = categoria.toUpperCase().trim();
  return CATEGORY_ASSETS[key] || CATEGORY_ASSETS.DEFAULT;
}
