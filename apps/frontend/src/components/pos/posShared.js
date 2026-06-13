// Constantes y helpers compartidos por los componentes del POS.
export const money = (n) => '$' + Number(n || 0).toLocaleString('es-CL');

export const PAYMENTS = [
  { id: 'EFECTIVO', label: '💵 Efectivo', color: 'bg-green-600' },
  { id: 'POS', label: '💳 POS', color: 'bg-blue-600' },
  { id: 'TRANSFERENCIA', label: '📲 Transferencia', color: 'bg-purple-600' },
];

export const PAY_CARDS = [
  { id: 'EFECTIVO', icon: '💵', label: 'Efectivo' },
  { id: 'POS', icon: '💳', label: 'Tarjeta' },
  { id: 'TRANSFERENCIA', icon: '🏦', label: 'Transferencia' },
];

export const CAT_ORDER = ['POLLO', 'COMBOS', 'COLACIONES', 'PAPAS', 'SNACKS', 'BEBIDAS'];

// Tope de descuento (%) que un cajero puede aplicar sin validación de un supervisor.
// Debe coincidir con DISCOUNT_MAX_PCT del backend (services/sales.js).
export const DISCOUNT_MAX_PCT = Number(import.meta.env.VITE_DISCOUNT_MAX_PCT || 15);
