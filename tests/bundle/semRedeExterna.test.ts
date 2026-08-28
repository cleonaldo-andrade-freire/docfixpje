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

const gz = (arquivo: string) => gzipSync(readFileSync(join(distAssets, arquivo))).length;

test('chunk de entrada (main + css) enxuto: < 120 KB gzip (spec §1.2)', () => {
  const arquivos = readdirSync(distAssets);
  const entrada = arquivos.filter(
    (f) => /^main-.*\.js$/.test(f) || /^main-.*\.css$/.test(f) || /^index-.*\.(js|css)$/.test(f),
  );
  expect(entrada.length).toBeGreaterThan(0);
  const totalGz = entrada.reduce((n, f) => n + gz(f), 0);
  expect(totalGz).toBeLessThan(120 * 1024);
});

test('total JS+CSS < 300 KB gzip — Fase 2 sem WASM (spec §14.5)', () => {
  const totalGz = readdirSync(distAssets)
    .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
    .reduce((n, f) => n + gz(f), 0);
  expect(totalGz).toBeLessThan(300 * 1024);
});

test('o worker de PDF é chunk separado, não entra no index.html (spec §14.5)', () => {
  const html = readFileSync(join(raiz, 'dist', 'index.html'), 'utf8');
  expect(html).not.toMatch(/pdf\.worker/);
  expect(readdirSync(distAssets).some((f) => /^pdf\.worker-.*\.js$/.test(f))).toBe(true);
});

test('nenhum .wasm no bundle da Fase 2 (motor real ainda não embarcado)', () => {
  const wasm = readdirSync(distAssets).filter((f) => f.endsWith('.wasm'));
  expect(wasm).toEqual([]);
});
