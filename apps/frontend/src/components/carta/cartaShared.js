// Constantes y helpers compartidos por los componentes de la Carta.
export const money = (n) => '$' + Number(n).toLocaleString('es-CL');
export const CAT_ORDER = ['POLLO', 'COMBOS', 'COLACIONES', 'PAPAS', 'SNACKS', 'BEBIDAS'];
export const marginColor = (m) => (m >= 50 ? 'text-green-600' : m >= 30 ? 'text-amber-600' : 'text-red-600');
