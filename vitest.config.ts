import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
    exclude: ['tests/e2e/**', 'node_modules/**'],
    // Fixtures de fronteira têm 10-25 MB; a análise sob suíte paralela pode
    // passar dos 5 s padrão.
    testTimeout: 20_000,
  },
});
