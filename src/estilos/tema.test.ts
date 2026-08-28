import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';

const aqui = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(aqui, 'tokens.css'), 'utf8');
const global = readFileSync(join(aqui, 'global.css'), 'utf8');

test('tokens define paleta clara e a redefine em prefers-color-scheme: dark', () => {
  const vars = ['--cor-fundo', '--cor-texto', '--cor-ok', '--cor-erro', '--cor-atencao', '--cor-foco'];
  for (const v of vars) {
    // definida no :root base
    expect(tokens).toMatch(new RegExp(`:root\\s*\\{[\\s\\S]*?${v}\\s*:`));
    // redefinida no bloco dark
    const dark = tokens.slice(tokens.indexOf('prefers-color-scheme: dark'));
    expect(dark).toContain(`${v}:`);
  }
});

test('transições de estado ficam entre 150 e 250 ms (spec §1.7)', () => {
  const m = tokens.match(/--dur-transicao:\s*(\d+)ms/);
  expect(m).not.toBeNull();
  const ms = Number(m![1]);
  expect(ms).toBeGreaterThanOrEqual(150);
  expect(ms).toBeLessThanOrEqual(250);
});

test('global respeita prefers-reduced-motion', () => {
  expect(global).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  expect(global).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
});

test('foco visível definido', () => {
  expect(global).toMatch(/:focus-visible\s*\{[\s\S]*?outline:/);
});

test('números tabulares disponíveis', () => {
  expect(global).toContain('font-variant-numeric: tabular-nums');
});
