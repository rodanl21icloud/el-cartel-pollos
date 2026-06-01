import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'logo.jpeg'],
      manifest: {
        name: 'El Cartel de los Pollos — POS',
        short_name: 'Cartel POS',
        description: 'Punto de venta delivery-only, offline-first.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
