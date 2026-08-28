import { describe, expect, test } from 'vitest';
import { validarArquivo } from './validarArquivo';
import type { ConfigValidacao } from './contexto';
import { lerFixture } from '../../scripts/lib/ler-fixture';

const fx = new Proxy({} as Record<string, Uint8Array>, {
  get: (_t, p) => lerFixture(String(p)),
});

const val = (nome: string, config?: ConfigValidacao) =>
  validarArquivo(nome, fx[nome]!, config ? { config } : {});

const cod = (r: { ocorrencias: { codigo: string }[] }) => r.ocorrencias.map((o) => o.codigo);
const cfg = (over: Partial<ConfigValidacao['pdfa']>): ConfigValidacao => ({
  pdfa: { pdfaObrigatorio: true, pdfaGravidade: 'aviso', pdfaPartesAceitas: [1, 2, 3, 4], ...over },
});

describe('spec §14.1', () => {
  test('PDF sem assinatura -> apto, nenhum erro', async () => {
    const r = await val('simples.pdf');
    expect(r.apto).toBe(true);
    expect(r.ocorrencias.some((o) => o.gravidade === 'erro')).toBe(false);
  });

  test('PDF assinado -> ASSINATURA_PRESENTE, inapto, corrigível', async () => {
    const r = await val('assinado.pdf');
    expect(cod(r)).toContain('ASSINATURA_PRESENTE');
    expect(r.apto).toBe(false);
    expect(r.corrigivel).toBe(true);
  });

  test('campo de assinatura vazio -> aviso, apto', async () => {
    const r = await val('campo-sig-vazio.pdf');
    expect(cod(r)).toContain('CAMPO_ASSINATURA_VAZIO');
    expect(r.apto).toBe(true);
  });

  test('10.485.760 bytes -> sem TAMANHO_EXCEDIDO; 10.485.761 -> com', async () => {
    expect(fx['limite-exato.pdf']!.length).toBe(10_485_760);
    expect(fx['acima-limite.pdf']!.length).toBe(10_485_761);
    const exato = await val('limite-exato.pdf');
    expect(exato.tamanhoBytes).toBe(10_485_760);
    expect(cod(exato)).not.toContain('TAMANHO_EXCEDIDO');
    const acima = await val('acima-limite.pdf');
    expect(cod(acima)).toContain('TAMANHO_EXCEDIDO');
    expect(acima.apto).toBe(false);
  });

  test('PDF com /Encrypt que abre (restrições) -> NÃO é ARQUIVO_CRIPTOGRAFADO', async () => {
    const r = await val('criptografado.pdf');
    expect(cod(r)).not.toContain('ARQUIVO_CRIPTOGRAFADO');
    // sem assinatura, só avisos de PDF/A -> apto
    expect(r.apto).toBe(true);
  });

  test('PDF assinado E criptografado (CTPS Digital) -> inapto, corrigível', async () => {
    const r = await val('assinado-criptografado.pdf');
    expect(cod(r)).toContain('ASSINATURA_PRESENTE');
    expect(cod(r)).not.toContain('ARQUIVO_CRIPTOGRAFADO');
    expect(r.apto).toBe(false);
    expect(r.corrigivel).toBe(true);
  });

  test('.exe renomeado -> FORMATO_NAO_SUPORTADO', async () => {
    const r = await val('falso.pdf');
    expect(cod(r)).toEqual(['FORMATO_NAO_SUPORTADO']);
    expect(r.tipoDetectado).toBeNull();
  });

  test('MP3/MP4 abaixo do limite -> apto, sem checklist de assinatura nem PDF/A', async () => {
    for (const nome of ['audio.mp3', 'video.mp4']) {
      const r = await val(nome);
      expect(r.apto, nome).toBe(true);
      expect(cod(r).some((c) => c.startsWith('PDFA_') || c.startsWith('ASSINATURA') || c === 'CAMPO_ASSINATURA_VAZIO')).toBe(false);
    }
  });

  test('MP4 grande -> reprovado só por tamanho', async () => {
    const r = await val('video-grande.mp4');
    expect(cod(r)).toEqual(['TAMANHO_EXCEDIDO']);
    expect(r.ocorrencias[0]!.correcaoDisponivel).toBeNull();
  });

  test('PDF/A-1b -> apto, pdfaParte 1, conformidade B, sem ocorrências', async () => {
    const r = await val('pdfa-1b.pdf');
    expect(r.apto).toBe(true);
    expect(r.pdfaParte).toBe(1);
    expect(r.pdfaConformidade).toBe('B');
    expect(r.ocorrencias).toEqual([]);
  });

  test('PDF/A-2b com transparência -> apto, sem PDFA_TRANSPARENCIA', async () => {
    const r = await val('pdfa-2b-transparencia.pdf');
    expect(cod(r)).not.toContain('PDFA_TRANSPARENCIA');
  });

  test('declara PDF/A-1b sem OutputIntents -> INCONSISTENTE + SEM_OUTPUTINTENT', async () => {
    const c = cod(await val('declara-a1b-sem-oi.pdf'));
    expect(c).toContain('PDFA_DECLARACAO_INCONSISTENTE');
    expect(c).toContain('PDFA_SEM_OUTPUTINTENT');
  });

  test('fonte não embutida -> PDFA_FONTE_NAO_EMBUTIDA', async () => {
    expect(cod(await val('fonte-nao-embutida.pdf'))).toContain('PDFA_FONTE_NAO_EMBUTIDA');
  });

  test('pdfaObrigatorio:false -> nenhuma ocorrência PDFA_*', async () => {
    const c = cod(await val('simples-sem-pdfa.pdf', cfg({ pdfaObrigatorio: false })));
    expect(c.some((x) => x.startsWith('PDFA_'))).toBe(false);
  });

  test('pdfaGravidade:aviso -> ocorrência presente e apto:true', async () => {
    const r = await val('simples-sem-pdfa.pdf', cfg({}));
    expect(cod(r)).toContain('PDFA_NAO_DECLARADO');
    expect(r.apto).toBe(true);
  });

  test('lote de 5 arquivos -> 5 resultados independentes', async () => {
    const nomes = ['simples.pdf', 'assinado.pdf', 'pdfa-1b.pdf', 'audio.mp3', 'acima-limite.pdf'];
    const rs = await Promise.all(nomes.map((n) => val(n)));
    expect(rs.map((r) => r.apto)).toEqual([true, false, true, true, false]);
    expect(rs.map((r) => r.nomeArquivo)).toEqual(nomes);
  });
});

test('onEtapa recebe as mensagens literais da spec §6, em ordem', async () => {
  const etapas: string[] = [];
  await validarArquivo('assinado.pdf', fx['assinado.pdf']!, { onEtapa: (m) => etapas.push(m) });
  expect(etapas.slice(0, 2)).toEqual(['Lendo o arquivo…', 'Verificando o tipo do arquivo…']);
  expect(etapas).toContain('Procurando assinatura digital…');
  expect(etapas).toContain('Verificando o formato PDF/A…');
  expect(etapas).toContain('Conferindo o tamanho…');
});

test('falha catastrófica de parsing não lança: vira ARQUIVO_CORROMPIDO', async () => {
  const r = await validarArquivo('corrompido.pdf', fx['corrompido.pdf']!);
  expect(r.ocorrencias.map((o) => o.codigo)).toContain('ARQUIVO_CORROMPIDO');
  expect(r.apto).toBe(false);
  expect(r.corrigivel).toBe(false);
});
