import { defineConfig } from 'vitest/config';

// Config separada: os testes de bundle analisam dist/ e rodam em Node puro.
export default defineConfig({
  test: {
    include: ['tests/bundle/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
});
