import { beforeAll, expect, test } from 'vitest';
import { montarContexto, type ConfigValidacao } from './contexto';
import { validarPdfaDeclaracao } from './pdfaDeclaracao';
import { validarPdfaEstrutura } from './pdfaEstrutura';
import type { TipoDetectado } from '../tipos';
import { gerarTodas } from '../../scripts/gerar-fixtures';

let fx: Record<string, Uint8Array>;
beforeAll(async () => {
  fx = await gerarTodas();
}, 60_000);

const cfg = (over: Partial<ConfigValidacao['pdfa']>): ConfigValidacao => ({
  pdfa: { pdfaObrigatorio: true, pdfaGravidade: 'aviso', pdfaPartesAceitas: [1, 2, 3, 4], ...over },
});
const ctxDe = (nome: string, tipo: TipoDetectado, c?: ConfigValidacao) =>
  montarContexto(nome, fx[nome]!, tipo, c);

const codigos = (oc: { codigo: string }[]) => oc.map((o) => o.codigo);

test('PDF/A-1b válido: nível 1 e nível 2 sem ocorrências', async () => {
  const ctx = await ctxDe('pdfa-1b.pdf', 'application/pdf');
  expect(validarPdfaDeclaracao(ctx)).toEqual([]);
  expect(validarPdfaEstrutura(ctx)).toEqual([]);
});

test('PDF sem XMP -> PDFA_NAO_DECLARADO com gravidade da config', async () => {
  const aviso = await ctxDe('simples-sem-pdfa.pdf', 'application/pdf', cfg({}));
  expect(validarPdfaDeclaracao(aviso)[0]).toMatchObject({
    codigo: 'PDFA_NAO_DECLARADO',
    gravidade: 'aviso',
  });
  const erro = await ctxDe('simples-sem-pdfa.pdf', 'application/pdf', cfg({ pdfaGravidade: 'erro' }));
  expect(validarPdfaDeclaracao(erro)[0]!.gravidade).toBe('erro');
});

test('pdfaObrigatorio: false -> nenhuma ocorrência nos dois níveis', async () => {
  const ctx = await ctxDe('simples-sem-pdfa.pdf', 'application/pdf', cfg({ pdfaObrigatorio: false }));
  expect(validarPdfaDeclaracao(ctx)).toEqual([]);
  expect(validarPdfaEstrutura(ctx)).toEqual([]);
});

test('declara PDF/A-1b sem OutputIntents -> INCONSISTENTE + SEM_OUTPUTINTENT', async () => {
  const ctx = await ctxDe('declara-a1b-sem-oi.pdf', 'application/pdf');
  const cod = codigos(validarPdfaEstrutura(ctx));
  expect(cod).toContain('PDFA_SEM_OUTPUTINTENT');
  expect(cod).toContain('PDFA_DECLARACAO_INCONSISTENTE');
});

test('fonte não embutida -> PDFA_FONTE_NAO_EMBUTIDA', async () => {
  const ctx = await ctxDe('fonte-nao-embutida.pdf', 'application/pdf');
  expect(codigos(validarPdfaEstrutura(ctx))).toContain('PDFA_FONTE_NAO_EMBUTIDA');
});

test('PDF/A-2b com transparência -> sem PDFA_TRANSPARENCIA', async () => {
  const ctx = await ctxDe('pdfa-2b-transparencia.pdf', 'application/pdf');
  expect(codigos(validarPdfaEstrutura(ctx))).not.toContain('PDFA_TRANSPARENCIA');
});

test('MP3 -> Regra 3 não se aplica', async () => {
  const ctx = await ctxDe('audio.mp3', 'audio/mpeg');
  expect(validarPdfaDeclaracao(ctx)).toEqual([]);
  expect(validarPdfaEstrutura(ctx)).toEqual([]);
});
