/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Marca: rojo "cartel" + tinta (slate) para superficies/sidebar.
        cartel: {
          DEFAULT: '#dc2626', // red-600, vibrante y moderno
          dark: '#991b1b',
          light: '#f87171',
        },
        ink: {
          DEFAULT: '#0f172a', // slate-900
          soft: '#1e293b',
          mute: '#64748b',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)',
        soft: '0 4px 16px rgba(16,24,40,.08)',
        pop: '0 10px 40px rgba(16,24,40,.18)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};
