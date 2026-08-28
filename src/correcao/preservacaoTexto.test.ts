import { expect, test } from 'vitest';
import { extrairTextoCru, normalizarTexto, similaridadeTexto, textoPreservado } from './preservacaoTexto';
import { lerFixture } from '../../scripts/lib/ler-fixture';

test('extrai o texto dos operadores Tj', () => {
  const t = extrairTextoCru(lerFixture('assinado.pdf'));
  expect(normalizarTexto(t)).toContain('documento ficticio');
});

test('similaridade: textos iguais = 1, disjuntos = 0', () => {
  expect(similaridadeTexto('o rato roeu a roupa', 'o rato roeu a roupa')).toBe(1);
  expect(similaridadeTexto('abc def', 'xyz uvw')).toBe(0);
});

test('textoPreservado: mesmo conteúdo -> preservado', () => {
  const b = lerFixture('assinado.pdf');
  expect(textoPreservado(b, b).preservado).toBe(true);
});

test('textoPreservado: original com texto vs saída sem texto -> não preservado', () => {
  const comTexto = lerFixture('assinado.pdf');
  const semTexto = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-" e mais nada
  expect(textoPreservado(comTexto, semTexto).preservado).toBe(false);
});
