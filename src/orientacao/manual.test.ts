import { expect, test } from 'vitest';
import { montarOrientacaoManual } from './manual';
import type { Ocorrencia, CodigoOcorrencia } from '../tipos';

const oc = (codigo: CodigoOcorrencia): Ocorrencia => ({
  codigo,
  gravidade: 'erro',
  mensagem: '',
  detalheTecnico: '',
  orientacao: '',
  correcaoDisponivel: null,
});

test('assinatura + PDF/A -> UMA orientação encadeada de 2 passos (§7.4)', () => {
  const r = montarOrientacaoManual([oc('ASSINATURA_PRESENTE'), oc('PDFA_NAO_DECLARADO')]);
  expect(r).toHaveLength(1);
  expect(r[0]!.passos).toHaveLength(2);
  expect(r[0]!.passos[1]!.detalhe).toMatch(/PDF\/A/);
  expect(r[0]!.passos[1]!.detalhe).toMatch(/LibreOffice/i);
});

test('só assinatura -> uma orientação de reimpressão', () => {
  const r = montarOrientacaoManual([oc('ASSINATURA_PRESENTE')]);
  expect(r).toHaveLength(1);
  expect(r[0]!.passos[0]!.detalhe).toMatch(/Ctrl\+P|Salvar como PDF/);
});

test('só tamanho -> uma orientação de redução/divisão', () => {
  const r = montarOrientacaoManual([oc('TAMANHO_EXCEDIDO')]);
  expect(r).toHaveLength(1);
  expect(r[0]!.passos[0]!.detalhe).toMatch(/dividir|comprima|bitrate/i);
});

test('RESTRICAO_DOCMDP conta como assinatura no encadeamento', () => {
  const r = montarOrientacaoManual([oc('RESTRICAO_DOCMDP'), oc('PDFA_SEM_OUTPUTINTENT')]);
  expect(r).toHaveLength(1);
  expect(r[0]!.passos).toHaveLength(2);
});

test('sem ocorrências corrigíveis -> lista vazia', () => {
  expect(montarOrientacaoManual([oc('CAMPO_ASSINATURA_VAZIO')])).toEqual([]);
});
