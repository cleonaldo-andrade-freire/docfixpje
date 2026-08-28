import { LIMITES, PDFA } from './limites';

test('limite de tamanho é exatamente 10 * 1024 * 1024', () => {
  expect(LIMITES.TAMANHO_MAX_BYTES).toBe(10_485_760);
});

test('máximo de arquivos por lote é 20', () => {
  expect(LIMITES.MAX_ARQUIVOS_LOTE).toBe(20);
});

test('ociosidade é 30 minutos em ms', () => {
  expect(LIMITES.OCIOSIDADE_MS).toBe(30 * 60 * 1000);
});

test('atraso de revogação de blob é 30 s em ms', () => {
  expect(LIMITES.REVOGACAO_BLOB_DELAY_MS).toBe(30 * 1000);
});

test('timeout de correção de PDF é 120 s em ms', () => {
  expect(LIMITES.TIMEOUT_CORRECAO_PDF_MS).toBe(120_000);
});

test('PDF/A: padrão de fábrica é aviso e partes 1..4', () => {
  expect(PDFA.pdfaGravidade).toBe('aviso');
  expect(PDFA.pdfaPartesAceitas).toEqual([1, 2, 3, 4]);
  expect(PDFA.pdfaObrigatorio).toBe(true);
});

test('tamanho absoluto de leitura é maior que o limite e finito', () => {
  expect(LIMITES.TAMANHO_ABSOLUTO_LEITURA_BYTES).toBeGreaterThan(LIMITES.TAMANHO_MAX_BYTES);
  expect(Number.isFinite(LIMITES.TAMANHO_ABSOLUTO_LEITURA_BYTES)).toBe(true);
});
