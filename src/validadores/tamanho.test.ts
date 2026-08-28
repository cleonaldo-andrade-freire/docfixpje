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

test('MP4 grande -> correção RECODIFICAR_MIDIA', () => {
  const o = validarTamanho(ctxFake(50 * 1024 * 1024, 'video/mp4'));
  expect(o[0]!.correcaoDisponivel).toBe('RECODIFICAR_MIDIA');
});
