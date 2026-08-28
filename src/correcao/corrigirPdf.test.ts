import { describe, expect, test, vi } from 'vitest';
import { corrigirPdf, nomeCorrigido } from './corrigirPdf';
import { argumentosGs } from './argumentosGs';
import type { MotorPdf, SaidaMotor } from './motor';
import type { Ocorrencia } from '../tipos';
import { COMPRESSAO_TENTATIVAS, LIMITES } from '../config/limites';
import { lerFixture } from '../../scripts/lib/ler-fixture';

const oc = (
  codigo: Ocorrencia['codigo'],
  correcao: Ocorrencia['correcaoDisponivel'] = 'CONVERTER_PDFA',
): Ocorrencia => ({
  codigo,
  gravidade: 'erro',
  mensagem: '',
  detalheTecnico: '',
  orientacao: '',
  correcaoDisponivel: correcao,
});

function motorFake(
  saida: (entrada: Uint8Array, args: string[]) => SaidaMotor,
): MotorPdf & { chamadas: number; ultimosArgs: string[] } {
  const m = {
    chamadas: 0,
    ultimosArgs: [] as string[],
    executar: vi.fn(async (entrada: Uint8Array, args: string[]) => {
      m.chamadas++;
      m.ultimosArgs = args;
      return saida(entrada, args);
    }),
  };
  return m as unknown as MotorPdf & { chamadas: number; ultimosArgs: string[] };
}

/** Stand-in do Ghostscript: tira a camada de assinatura, preservando o texto. */
function reescreverSemAssinatura(entrada: Uint8Array): Uint8Array {
  let s = Array.from(entrada, (b) => String.fromCharCode(b)).join('');
  s = s
    .replace(/\/SigFlags\s+\d+/g, '/SigFlags 0')
    .replace(/\/ByteRange\s*\[[^\]]*\]/g, '')
    .replace(/\/Contents\s*<[0-9A-Fa-f\s]*>/g, '')
    .replace(/\/FT\s*\/Sig/g, '/FT /Tx')
    .replace(/\/AcroForm[^R]*R/g, '')
    .replace(/\/Perms[^>]*>>/g, '');
  return new Uint8Array(Array.from(s, (c) => c.charCodeAt(0) & 0xff));
}

const limpo = () => lerFixture('simples-sem-pdfa.pdf');
const assinado = () => lerFixture('assinado.pdf');
const pdfaOk = () => lerFixture('pdfa-1b.pdf');
const ehLimpo = (args: string[]) => args.includes('-dPreserveAnnots=false');

describe('argumentosGs — estratégias', () => {
  test('pdfa: PDF/A-2b + pdfwrite + compressão', () => {
    const args = argumentosGs({ estrategia: 'pdfa', nivel: COMPRESSAO_TENTATIVAS[0]! });
    expect(args).toContain('-dPDFA=2');
    expect(args).toContain('-sDEVICE=pdfwrite');
    expect(args).toContain('-dPDFSETTINGS=/ebook');
    expect(args).toContain('-dColorImageResolution=150');
    expect(args).not.toContain('-dPreserveAnnots=false');
  });
  test('limpo: pdfwrite sem PDF/A, descartando anotações', () => {
    const args = argumentosGs({ estrategia: 'limpo', nivel: COMPRESSAO_TENTATIVAS[2]! });
    expect(args).toContain('-sDEVICE=pdfwrite');
    expect(args).toContain('-dPreserveAnnots=false');
    expect(args).not.toContain('-dPDFA=2');
    expect(args).toContain('-dPDFSETTINGS=/screen');
  });
  test('rasterizado: pdfimage24 (impressora virtual)', () => {
    const args = argumentosGs({ estrategia: 'rasterizado', nivel: COMPRESSAO_TENTATIVAS[0]! });
    expect(args).toContain('-sDEVICE=pdfimage24');
    expect(args.join(' ')).toMatch(/-r\d+/);
  });
});

test('nomeCorrigido: documento.pdf -> documento-corrigido.pdf', () => {
  expect(nomeCorrigido('documento.pdf')).toBe('documento-corrigido.pdf');
  expect(nomeCorrigido('ctps-digital.PDF')).toBe('ctps-digital-corrigido.PDF');
});

test('tier 1 (PDF/A) resolve -> corrigido, texto preservado, 1 invocação', async () => {
  const motor = motorFake((entrada) => ({ codigo: 0, bytes: reescreverSemAssinatura(entrada), log: '' }));
  const { resultado, bytesCorrigidos } = await corrigirPdf({
    nomeArquivo: 'assinado.pdf',
    bytes: assinado(),
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA')],
    motor,
  });
  expect(resultado.sucesso).toBe(true);
  expect(resultado.revalidacao.apto).toBe(true);
  expect(resultado.textoPreservado).toBe(true);
  expect(motor.chamadas).toBe(1);
  expect(bytesCorrigidos).not.toBeNull();
});

test('tier 1 falha (mantém assinatura) -> tier 2 (limpo) resolve', async () => {
  // pdfa devolve a entrada intacta; limpo tira a assinatura
  const motor = motorFake((entrada, args) => ({
    codigo: 0,
    bytes: ehLimpo(args) ? reescreverSemAssinatura(entrada) : entrada.slice(),
    log: '',
  }));
  const { resultado } = await corrigirPdf({
    nomeArquivo: 'assinado.pdf',
    bytes: assinado(),
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA')],
    motor,
  });
  expect(resultado.sucesso).toBe(true);
  expect(resultado.textoPreservado).toBe(true);
  expect(motor.chamadas).toBe(2); // pdfa, depois limpo
});

test('tiers 1 e 2 falham (texto perdido) -> tier 3 (rasterizado) resolve, com aviso', async () => {
  // qualquer estratégia devolve um PDF sem assinatura mas com OUTRO texto
  const motor = motorFake(() => ({ codigo: 0, bytes: limpo(), log: '' }));
  const { resultado, bytesCorrigidos } = await corrigirPdf({
    nomeArquivo: 'assinado.pdf',
    bytes: assinado(),
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA')],
    motor,
  });
  expect(resultado.sucesso).toBe(true);
  expect(resultado.textoPreservado).toBe(false);
  expect(resultado.avisos.join(' ')).toMatch(/convertidas em imagem/i);
  expect(bytesCorrigidos).not.toBeNull();
  expect(motor.chamadas).toBe(3); // pdfa, limpo, rasterizado
});

test('motor código 0 mas a saída NUNCA perde a assinatura -> correcao_falhou (teste-chave)', async () => {
  const motor = motorFake(() => ({ codigo: 0, bytes: assinado(), log: '' }));
  const { resultado, bytesCorrigidos } = await corrigirPdf({
    nomeArquivo: 'assinado.pdf',
    bytes: assinado(),
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA')],
    motor,
  });
  expect(resultado.sucesso).toBe(false);
  expect(resultado.revalidacao.apto).toBe(false);
  expect(bytesCorrigidos).toBeNull();
});

test('não-PDF/A (sem assinatura) -> corrigido pelo tier 1', async () => {
  const motor = motorFake(() => ({ codigo: 0, bytes: pdfaOk(), log: '' }));
  const { resultado } = await corrigirPdf({
    nomeArquivo: 's.pdf',
    bytes: limpo(),
    ocorrencias: [oc('PDFA_NAO_DECLARADO')],
    motor,
  });
  expect(resultado.sucesso).toBe(true);
  expect(resultado.revalidacao.ocorrencias.filter((o) => o.gravidade === 'erro')).toEqual([]);
  expect(motor.chamadas).toBe(1);
});

test('assinado + não-PDF/A + acima do limite -> uma passada (tier 1, 1º nível) resolve', async () => {
  const base = assinado();
  const inflado = new Uint8Array(LIMITES.TAMANHO_MAX_BYTES + 1);
  inflado.set(base, 0);
  const motor = motorFake((entrada) => ({
    codigo: 0,
    bytes: reescreverSemAssinatura(entrada.subarray(0, base.length + 200)),
    log: '',
  }));
  const { resultado } = await corrigirPdf({
    nomeArquivo: 'tudo.pdf',
    bytes: inflado,
    ocorrencias: [
      oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA'),
      oc('PDFA_NAO_DECLARADO'),
      oc('TAMANHO_EXCEDIDO', 'COMPRIMIR_PDF'),
    ],
    motor,
  });
  expect(resultado.sucesso).toBe(true);
  expect(motor.chamadas).toBe(1);
  expect(resultado.estrategias).toEqual(
    expect.arrayContaining(['REMOVER_ASSINATURA', 'CONVERTER_PDFA', 'COMPRIMIR_PDF']),
  );
});

test('25 MB com imagens -> comprime abaixo do limite, com aviso de resolução', async () => {
  let chamada = 0;
  const motor = motorFake(() => {
    chamada++;
    const tam = chamada < 3 ? LIMITES.TAMANHO_MAX_BYTES + 5 : LIMITES.TAMANHO_MAX_BYTES - 5;
    return { codigo: 0, bytes: preencherComoPdf(tam), log: '' };
  });
  const { resultado } = await corrigirPdf({
    nomeArquivo: 'imagens.pdf',
    bytes: new Uint8Array(25 * 1024 * 1024),
    ocorrencias: [oc('TAMANHO_EXCEDIDO', 'COMPRIMIR_PDF')],
    motor,
  });
  expect(resultado.tamanhoDepois).toBeLessThan(LIMITES.TAMANHO_MAX_BYTES);
  expect(resultado.avisos.join(' ')).toMatch(/resolução das imagens foi reduzida/i);
});

test('impossível comprimir abaixo do limite -> correcao_falhou com menor tamanho', async () => {
  const motor = motorFake(() => ({ codigo: 0, bytes: new Uint8Array(LIMITES.TAMANHO_MAX_BYTES + 1000), log: '' }));
  const { resultado, bytesCorrigidos } = await corrigirPdf({
    nomeArquivo: 'grande.pdf',
    bytes: new Uint8Array(20 * 1024 * 1024),
    ocorrencias: [oc('TAMANHO_EXCEDIDO', 'COMPRIMIR_PDF')],
    motor,
  });
  expect(resultado.sucesso).toBe(false);
  expect(bytesCorrigidos).toBeNull();
  expect(resultado.avisos.join(' ')).toMatch(/menor tamanho alcançado/i);
});

test('emite as mensagens de etapa', async () => {
  const etapas: string[] = [];
  const motor = motorFake((entrada) => ({ codigo: 0, bytes: reescreverSemAssinatura(entrada), log: '' }));
  await corrigirPdf({
    nomeArquivo: 'assinado.pdf',
    bytes: assinado(),
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA'), oc('TAMANHO_EXCEDIDO', 'COMPRIMIR_PDF')],
    motor,
    onEtapa: (m) => etapas.push(m),
  });
  expect(etapas.some((e) => /Comprimindo — tentativa 1 de 4…/.test(e))).toBe(true);
  expect(etapas).toContain('Revalidando o arquivo corrigido…');
});

function preencherComoPdf(n: number): Uint8Array {
  const b = new Uint8Array(n);
  b.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37], 0);
  return b;
}
