import { expect, test } from 'vitest';
import { validarTamanho } from './tamanho';
import { LIMITES } from '../config/limites';
import type { ContextoArquivo } from './contexto';
import type { TipoDetectado } from '../tipos';

const ctxFake = (tamanhoBytes: number, tipo: TipoDetectado): ContextoArquivo => ({
  nomeArquivo: 'x',
  bytes: new Uint8Array(),
  tamanhoBytes,
  tipo,
  pdf: null,
  config: { pdfa: { pdfaObrigatorio: true, pdfaGravidade: 'aviso', pdfaPartesAceitas: [1, 2, 3, 4] } },
});

test('exatamente no limite -> sem ocorrência', () => {
  expect(validarTamanho(ctxFake(LIMITES.TAMANHO_MAX_BYTES, 'application/pdf'))).toEqual([]);
});

test('um byte acima -> TAMANHO_EXCEDIDO erro, com excedente no detalhe', () => {
  const o = validarTamanho(ctxFake(LIMITES.TAMANHO_MAX_BYTES + 1, 'application/pdf'));
  expect(o[0]!.codigo).toBe('TAMANHO_EXCEDIDO');
  expect(o[0]!.gravidade).toBe('erro');
  expect(o[0]!.detalheTecnico).toContain('excedente 1 bytes');
  expect(o[0]!.correcaoDisponivel).toBe('COMPRIMIR_PDF');
});

test('PDF de 50 MB -> TAMANHO_EXCEDIDO (limite PDF é 10 MB)', () => {
  const o = validarTamanho(ctxFake(50 * 1024 * 1024, 'application/pdf'));
  expect(o[0]!.codigo).toBe('TAMANHO_EXCEDIDO');
});

test('MP4 de 50 MB -> OK (limite de mídia é 200 MB)', () => {
  expect(validarTamanho(ctxFake(50 * 1024 * 1024, 'video/mp4'))).toEqual([]);
});

test('MP3 de 199 MB -> OK; MP3 acima de 200 MB -> TAMANHO_EXCEDIDO, sem correção', () => {
  expect(validarTamanho(ctxFake(199 * 1024 * 1024, 'audio/mpeg'))).toEqual([]);
  const o = validarTamanho(ctxFake(LIMITES.TAMANHO_MAX_MIDIA_BYTES + 1, 'audio/mpeg'));
  expect(o[0]!.codigo).toBe('TAMANHO_EXCEDIDO');
  expect(o[0]!.correcaoDisponivel).toBeNull();
  expect(o[0]!.orientacao).toMatch(/bitrate menor/i);
  expect(o[0]!.mensagem).toMatch(/200,00 MB/);
});
