import { expect, test } from 'vitest';
import { podeCachear } from './politica';

const O = 'https://app.exemplo.br';

test('cacheia a raiz e o index', () => {
  expect(podeCachear(`${O}/`, O)).toBe(true);
  expect(podeCachear(`${O}/index.html`, O)).toBe(true);
  expect(podeCachear(`${O}/sw.js`, O)).toBe(true);
});

test('cacheia assets hashados da própria origem', () => {
  expect(podeCachear(`${O}/assets/index-abc123.js`, O)).toBe(true);
  expect(podeCachear(`${O}/assets/index-abc123.css`, O)).toBe(true);
  expect(podeCachear(`${O}/motores/gs.deadbeef.wasm`, O)).toBe(true);
});

test('NUNCA cacheia blob, data ou documento do usuário', () => {
  expect(podeCachear('blob:https://app.exemplo.br/12345', O)).toBe(false);
  expect(podeCachear('data:application/pdf;base64,AAAA', O)).toBe(false);
  expect(podeCachear(`${O}/algum-relatorio.pdf`, O)).toBe(false);
  expect(podeCachear(`${O}/assets/vazamento.pdf`, O)).toBe(false);
});

test('NUNCA cacheia outra origem (corta hotlink)', () => {
  expect(podeCachear('https://cdn.terceiro.com/lib.js', O)).toBe(false);
  expect(podeCachear('https://outro.app/assets/index.js', O)).toBe(false);
});

test('url malformada -> false', () => {
  expect(podeCachear('not a url', O)).toBe(false);
});
