import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'El Cartel de los Pollos — POS',
        short_name: 'Cartel POS',
        description: 'Punto de venta delivery-only, offline-first.',
        theme_color: '#b91c1c',
        background_color: '#18181b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // App shell precacheado -> el POS abre sin red desde cero.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Catálogo e insumos: red primero, cae a caché si no hay conexión.
            urlPattern: ({ url }) =>
              url.pathname === '/api/products' ||
              url.pathname === '/api/inventory/ingredients',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-catalogo',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
        // Nunca cachear ventas ni mutaciones: la cola IndexedDB ya las maneja.
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
