import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const headers = readFileSync(join(raiz, 'public', '_headers'), 'utf8');

function valor(nome: string): string {
  const m = headers.match(new RegExp(`^\\s+${nome}:\\s*(.+)$`, 'm'));
  if (!m) throw new Error(`cabeçalho ausente: ${nome}`);
  return m[1]!.trim();
}

test('CSP tem as diretivas que barram exfiltração (spec §10.3)', () => {
  const csp = valor('Content-Security-Policy');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("connect-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).toContain("form-action 'none'");
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).toContain("style-src 'self'");
});

test('cabeçalhos de robustez presentes (spec §10.4)', () => {
  expect(valor('Strict-Transport-Security')).toContain('max-age=');
  expect(valor('X-Content-Type-Options')).toBe('nosniff');
  expect(valor('Referrer-Policy')).toBe('no-referrer');
});

test('assets hashados são imutáveis por 1 ano (spec §10.1)', () => {
  expect(headers).toMatch(/\/assets\/\*[\s\S]*?Cache-Control: public, max-age=31536000, immutable/);
});

test('o service worker não é cacheado agressivamente', () => {
  expect(headers).toMatch(/\/sw\.js[\s\S]*?Cache-Control: no-cache/);
});
