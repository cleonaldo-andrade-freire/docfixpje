import { CODIGOS_OCORRENCIA, ESTRATEGIAS_CORRECAO } from './tipos';

test('lista de códigos de ocorrência bate com a spec §12 (16 códigos)', () => {
  expect(new Set(CODIGOS_OCORRENCIA)).toEqual(
    new Set([
      'ASSINATURA_PRESENTE',
      'CAMPO_ASSINATURA_VAZIO',
      'RESTRICAO_DOCMDP',
      'TAMANHO_EXCEDIDO',
      'FORMATO_NAO_SUPORTADO',
      'ARQUIVO_CRIPTOGRAFADO',
      'ARQUIVO_CORROMPIDO',
      'PDFA_NAO_DECLARADO',
      'PDFA_DECLARACAO_INCONSISTENTE',
      'PDFA_CRIPTOGRAFADO',
      'PDFA_SEM_OUTPUTINTENT',
      'PDFA_FONTE_NAO_EMBUTIDA',
      'PDFA_JAVASCRIPT',
      'PDFA_ARQUIVO_EMBUTIDO',
      'PDFA_TRANSPARENCIA',
      'PDFA_REFERENCIA_EXTERNA',
    ]),
  );
  expect(CODIGOS_OCORRENCIA).toHaveLength(16);
});

test('estratégias de correção batem com a spec §12', () => {
  expect(new Set(ESTRATEGIAS_CORRECAO)).toEqual(
    new Set(['REMOVER_ASSINATURA', 'CONVERTER_PDFA', 'COMPRIMIR_PDF', 'RECODIFICAR_MIDIA']),
  );
});
