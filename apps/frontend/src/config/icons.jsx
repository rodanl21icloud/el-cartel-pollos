// Íconos de línea (inline SVG, sin dependencias) para la navegación.
// Estética enterprise consistente: trazo 1.8, esquinas redondeadas, currentColor.
const ICONS = {
  home: '<path d="m3 11 9-8 9 8M5 9.5V21h14V9.5"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 2h3l2.6 13a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  receipt: '<path d="M5 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1V2l-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  chef: '<path d="M6 13h12v5a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-5Z"/><path d="M6 13a4 4 0 0 1 1-7 3 3 0 0 1 5-1 3 3 0 0 1 5 1 4 4 0 0 1 1 7"/>',
  moto: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l3-7h3M9 10h4"/>',
  flame: '<path d="M12 2c2 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 3 3 0-3-2-4 0-8Z"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  box: '<path d="M21 8v8a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  menu: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sparkles: '<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Z"/>',
  tv: '<rect x="2" y="7" width="20" height="13" rx="2"/><path d="m8 3 4 4 4-4"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 14 3-3 3 3 5-6"/>',
  pie: '<path d="M21 12A9 9 0 1 1 12 3v9Z"/><path d="M12 3a9 9 0 0 1 9 9h-9Z"/>',
  store: '<path d="M3 9 5 4h14l2 5M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9M3 9h18"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5l-8-3Z"/>',
  clipboard: '<rect x="6" y="4" width="12" height="18" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 10h6M9 14h6"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  _default: '<circle cx="12" cy="12" r="3"/>',
};

export function Icon({ name, size = 18, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}
      dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS._default }} />
  );
}
