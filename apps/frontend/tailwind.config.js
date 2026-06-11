/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Barlow', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Bebas Neue', 'Impact', 'sans-serif'],
        condensed: ['Barlow Condensed', 'ui-sans-serif', 'sans-serif'],
        mono: ['DM Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Sistema "Asador" — anclado al tema (pollo a las brasas + cartel).
        // Rojo = marca/acción · Brasa = atmósfera/realce · Carbón = superficies
        // oscuras (cálido, humo de leña) · Kraft = papel de despacho (contenido).
        cartel: {
          DEFAULT: '#dc2626', // rojo "cartel", acción primaria
          dark: '#991b1b',
          light: '#f87171',
        },
        ink: {
          DEFAULT: '#16110c', // carbón cálido (humo de leña), no negro frío
          soft: '#1e1810',
          mid: '#2a2118',
          border: '#3a2e22',  // borde tostado
          mute: '#8a7c6b',    // texto secundario cálido
          subtle: '#b6a78f',  // texto terciario cálido
        },
        ember: {
          DEFAULT: '#ff5a1f', // brasa viva
          dark: '#d6450f',
          glow: '#ffb070',
        },
        // Superficies claras cálidas (papel kraft / despacho).
        paper: {
          DEFAULT: '#f3efe7', // fondo de contenido
          card: '#fffdf8',    // tarjetas
          line: '#e7e0d4',    // bordes cálidos
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(40,28,16,.05), 0 1px 3px rgba(40,28,16,.09)',
        soft: '0 4px 16px rgba(40,28,16,.08)',
        pop: '0 10px 40px rgba(40,28,16,.18)',
        ember: '0 4px 22px rgba(255,90,31,.30)', // realce de CTA primario
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};
