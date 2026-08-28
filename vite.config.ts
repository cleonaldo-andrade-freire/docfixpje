import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// Cabeçalhos de produção lidos de public/_headers, aplicados no `vite preview`
// (que serve o build real). O `vite dev` NÃO recebe a CSP restritiva: o
// fast-refresh do @vitejs/plugin-react injeta script e estilo inline, que a
// CSP de produção bloqueia. Paridade de segurança se verifica no preview e no
// deploy, não no dev.
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

const headersProducao = headersDeArquivo();

// No dev, só os cabeçalhos que não atrapalham o HMR.
const headersDev: Record<string, string> = {
  'X-Content-Type-Options': headersProducao['X-Content-Type-Options'] ?? 'nosniff',
  'Referrer-Policy': headersProducao['Referrer-Policy'] ?? 'no-referrer',
};

export default defineConfig({
  plugins: [react()],
  server: { headers: headersDev },
  preview: { headers: headersProducao },
  // Worker como ES module: o worker faz import() dinâmico do adaptador do motor.
  worker: { format: 'es' },
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
