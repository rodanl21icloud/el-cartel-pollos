import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Un solo proceso sin aislamiento entre archivos: comparte el singleton
    // de DB y el Map de claves de sesión HMAC en memoria (Vitest 4).
    pool: 'forks',
    fileParallelism: false,
    isolate: false,
    maxWorkers: 1,
    minWorkers: 1,
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
