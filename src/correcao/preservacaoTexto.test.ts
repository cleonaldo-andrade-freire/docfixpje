import { expect, test } from 'vitest';
import { extrairTexto, normalizarTexto, similaridadeTexto, textoPreservado } from './preservacaoTexto';
import { lerFixture } from '../../scripts/lib/ler-fixture';

test('extrai o texto da página (streams sem filtro)', async () => {
  const t = extrairTexto(lerFixture('assinado.pdf'));
  expect(normalizarTexto(t)).toContain('documento ficticio');
});

test('extrai texto de content stream comprimido com FlateDecode', async () => {
  // monta um PDF-fragmento com um stream FlateDecode contendo "(Ola mundo) Tj"
  const zlib = await import('node:zlib');
  const conteudo = Buffer.from('BT /F1 12 Tf 72 700 Td (Ola mundo comprimido) Tj ET');
  const comprimido = zlib.deflateSync(conteudo);
  const frag = Buffer.concat([
    Buffer.from('4 0 obj\n<< /Length ' + comprimido.length + ' /Filter /FlateDecode >>\nstream\n'),
    comprimido,
    Buffer.from('\nendstream\nendobj\n'),
  ]);
  const t = extrairTexto(new Uint8Array(frag));
  expect(normalizarTexto(t)).toContain('ola mundo comprimido');
});

test('similaridade: iguais = 1, disjuntos = 0', () => {
  expect(similaridadeTexto('o rato roeu a roupa', 'o rato roeu a roupa')).toBe(1);
  expect(similaridadeTexto('abc def', 'xyz uvw')).toBe(0);
});

test('textoPreservado: mesmo PDF -> preservado', async () => {
  const b = lerFixture('assinado.pdf');
  expect((textoPreservado(b, b)).preservado).toBe(true);
});

test('textoPreservado: assinado x versão limpa com o MESMO texto -> preservado', async () => {
  const r = textoPreservado(lerFixture('assinado.pdf'), lerFixture('assinado-corrigido-ok.pdf'));
  expect(r.preservado).toBe(true);
});

test('textoPreservado: original com texto x saída sem texto -> não preservado', async () => {
  const semTexto = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
  const r = textoPreservado(lerFixture('assinado.pdf'), semTexto);
  expect(r.preservado).toBe(false);
});
