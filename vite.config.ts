import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Cabeçalhos espelhados de public/_headers para paridade em dev/preview (spec §10).
// A Task 32 preencherá o conjunto completo; aqui fica o mínimo para desenvolvimento.
const headersSeguranca: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

export default defineConfig({
  plugins: [react()],
  server: { headers: headersSeguranca },
  preview: { headers: headersSeguranca },
});
