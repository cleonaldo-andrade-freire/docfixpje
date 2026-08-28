import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Cabeçalhos espelhados de public/_headers para paridade em dev/preview (spec §10).
function headersDeArquivo(): Record<string, string> {
  try {
    const txt = readFileSync(new URL('./public/_headers', import.meta.url), 'utf8');
    const h: Record<string, string> = {};
    for (const linha of txt.split('\n')) {
      const m = linha.match(/^\s{2,}([A-Za-z-]+):\s*(.+)$/);
      if (m) h[m[1]!] = m[2]!.trim();
    }
    return h;
  } catch {
    return {};
  }
}

const headers = headersDeArquivo();

export default defineConfig({
  plugins: [react()],
  server: { headers },
  preview: { headers },
  build: {
    rollupOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        sw: new URL('./src/sw.ts', import.meta.url).pathname,
      },
      output: {
        // O service worker precisa sair na raiz com nome estável.
        entryFileNames: (chunk) =>
          chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
