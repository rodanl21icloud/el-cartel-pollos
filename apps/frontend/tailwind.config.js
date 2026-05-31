/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cartel: { DEFAULT: '#b91c1c', dark: '#7f1d1d' },
      },
    },
  },
  plugins: [],
};
