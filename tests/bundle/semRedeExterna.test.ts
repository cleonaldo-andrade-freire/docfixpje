import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { beforeAll, expect, test } from 'vitest';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const distAssets = join(raiz, 'dist', 'assets');

/** Hosts que aparecem como texto (namespaces XML, links de erro) — nunca como alvo de rede. */
const HOSTS_PERMITIDOS = new Set([
  'www.w3.org',
  'reactjs.org',
  'react.dev',
  'www.aiim.org',
  'github.com',
  'validador-pje.exemplo.br', // ENDERECO_OFICIAL, exibido como texto
]);

let arquivosJs: { nome: string; conteudo: string }[] = [];

beforeAll(() => {
  if (!existsSync(join(raiz, 'dist', 'index.html'))) {
    execSync('npx vite build', { cwd: raiz, stdio: 'inherit' });
  }
  arquivosJs = readdirSync(distAssets)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ nome: f, conteudo: readFileSync(join(distAssets, f), 'utf8') }));
  const sw = join(raiz, 'dist', 'sw.js');
  if (existsSync(sw)) arquivosJs.push({ nome: 'sw.js', conteudo: readFileSync(sw, 'utf8') });
}, 120_000);

test('nenhum host externo além dos textuais conhecidos', () => {
  for (const { nome, conteudo } of arquivosJs) {
    const urls = conteudo.match(/https?:\/\/[a-zA-Z0-9.-]+/g) ?? [];
    for (const u of urls) {
      const host = new URL(u).host;
      expect(HOSTS_PERMITIDOS.has(host), `${nome}: host inesperado ${host} (${u})`).toBe(true);
    }
  }
});

test('nenhuma telemetria: sem sendBeacon nem XMLHttpRequest', () => {
  for (const { nome, conteudo } of arquivosJs) {
    expect(conteudo, nome).not.toMatch(/sendBeacon/);
    expect(conteudo, nome).not.toMatch(/XMLHttpRequest/);
  }
});

test('nenhum fetch() com URL absoluta externa', () => {
  for (const { nome, conteudo } of arquivosJs) {
    expect(conteudo, nome).not.toMatch(/fetch\(\s*["'`]https?:\/\//);
  }
});

test('orçamento de tamanho da Fase 1: JS+CSS < 400 KB gzip (spec §1.2)', () => {
  let totalGz = 0;
  for (const f of readdirSync(distAssets)) {
    if (f.endsWith('.js') || f.endsWith('.css')) {
      totalGz += gzipSync(readFileSync(join(distAssets, f))).length;
    }
  }
  expect(totalGz).toBeLessThan(400 * 1024);
});
