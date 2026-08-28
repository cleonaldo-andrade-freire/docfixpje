import { describe, expect, test, vi } from 'vitest';
import { corrigirPdf, nomeCorrigido } from './corrigirPdf';
import { argumentosGs } from './argumentosGs';
import type { MotorPdf, SaidaMotor } from './motor';
import type { Ocorrencia } from '../tipos';
import { COMPRESSAO_TENTATIVAS, LIMITES } from '../config/limites';
import { lerFixture } from '../../scripts/lib/ler-fixture';

const oc = (codigo: Ocorrencia['codigo'], correcao: Ocorrencia['correcaoDisponivel'] = 'CONVERTER_PDFA'): Ocorrencia => ({
  codigo,
  gravidade: 'erro',
  mensagem: '',
  detalheTecnico: '',
  orientacao: '',
  correcaoDisponivel: correcao,
});

/** Motor falso: devolve `saida(entrada, args)`. */
function motorFake(saida: (entrada: Uint8Array, args: string[]) => SaidaMotor): MotorPdf & { chamadas: number } {
  const m = {
    chamadas: 0,
    executar: vi.fn(async (entrada: Uint8Array, args: string[]) => {
      m.chamadas++;
      return saida(entrada, args);
    }),
  };
  return m as unknown as MotorPdf & { chamadas: number };
}

const limpo = () => lerFixture('simples-sem-pdfa.pdf');
const pdfaOk = () => lerFixture('pdfa-1b.pdf');

/** Stand-in do que o Ghostscript faz: reescreve tirando a camada de assinatura,
 *  preservando o texto (os operadores `(...) Tj` ficam). */
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

describe('argumentosGs — uma passada (spec §8.1)', () => {
  test('sempre inclui PDF/A-2b + pdfwrite + o nível de compressão', () => {
    const args = argumentosGs({ ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA'), oc('PDFA_NAO_DECLARADO'), oc('TAMANHO_EXCEDIDO', 'COMPRIMIR_PDF')], nivel: COMPRESSAO_TENTATIVAS[0]! });
    expect(args).toContain('-dPDFA=2');
    expect(args).toContain('-sDEVICE=pdfwrite');
    expect(args).toContain('-dPDFSETTINGS=/ebook');
    expect(args).toContain('-dColorImageResolution=150');
    expect(args.join(' ')).not.toMatch(/PreserveAnnots|-dPreserveSig/);
  });
  test('nível screen 72 dpi', () => {
    const args = argumentosGs({ ocorrencias: [], nivel: COMPRESSAO_TENTATIVAS[2]! });
    expect(args).toContain('-dPDFSETTINGS=/screen');
    expect(args).toContain('-dColorImageResolution=72');
  });
});

test('nomeCorrigido: documento.pdf -> documento-corrigido.pdf (spec §8.3.4)', () => {
  expect(nomeCorrigido('documento.pdf')).toBe('documento-corrigido.pdf');
  expect(nomeCorrigido('ctps-digital.PDF')).toBe('ctps-digital-corrigido.PDF');
});

test('PDF assinado -> corrigido, revalidação apta, sem ocorrência de assinatura', async () => {
  const motor = motorFake((entrada) => ({ codigo: 0, bytes: reescreverSemAssinatura(entrada), log: '' }));
  const { resultado, bytesCorrigidos } = await corrigirPdf({
    nomeArquivo: 'assinado.pdf',
    bytes: lerFixture('assinado.pdf'),
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA')],
    motor,
  });
  expect(resultado.sucesso).toBe(true);
  expect(resultado.revalidacao.apto).toBe(true);
  expect(resultado.revalidacao.ocorrencias.map((o) => o.codigo)).not.toContain('ASSINATURA_PRESENTE');
  expect(resultado.estrategias).toContain('REMOVER_ASSINATURA');
  expect(resultado.estrategias).toContain('CONVERTER_PDFA');
  expect(bytesCorrigidos).not.toBeNull();
});

test('PDF assinado com texto: o texto continua equivalente após correção (spec §14.3, bloqueante)', async () => {
  // o motor falso preserva o mesmo texto do original
  const original = lerFixture('assinado.pdf');
  const motor = motorFake(() => ({ codigo: 0, bytes: original, log: '' }));
  const { resultado } = await corrigirPdf({
    nomeArquivo: 'assinado.pdf',
    bytes: original,
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA')],
    motor,
  });
  expect(resultado.textoPreservado).toBe(true);
});

test('motor rasteriza (perde o texto) -> textoPreservado false e sucesso false', async () => {
  const semTexto = lerFixture('simples-sem-pdfa.pdf'); // tem outro texto, não o do assinado
  const motor = motorFake(() => ({ codigo: 0, bytes: semTexto, log: '' }));
  const { resultado } = await corrigirPdf({
    nomeArquivo: 'assinado.pdf',
    bytes: lerFixture('assinado.pdf'),
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA')],
    motor,
  });
  expect(resultado.textoPreservado).toBe(false);
  expect(resultado.sucesso).toBe(false);
});

test('não-PDF/A -> corrigido, revalidação sem erro PDFA_*', async () => {
  const motor = motorFake(() => ({ codigo: 0, bytes: pdfaOk(), log: '' }));
  const { resultado } = await corrigirPdf({
    nomeArquivo: 's.pdf',
    bytes: limpo(),
    ocorrencias: [oc('PDFA_NAO_DECLARADO')],
    motor,
  });
  expect(resultado.sucesso).toBe(true);
  expect(resultado.revalidacao.ocorrencias.filter((o) => o.gravidade === 'erro')).toEqual([]);
});

test('assinado + não-PDF/A + acima do limite -> UMA invocação por tentativa, revalida apto', async () => {
  // entrada = assinado.pdf inflado além do limite (mantém o texto e a assinatura)
  const base = lerFixture('assinado.pdf');
  const inflado = new Uint8Array(LIMITES.TAMANHO_MAX_BYTES + 1);
  inflado.set(base, 0);
  const motor = motorFake((entrada) => ({ codigo: 0, bytes: reescreverSemAssinatura(entrada.subarray(0, base.length + 200)), log: '' }));
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
  expect(motor.chamadas).toBe(1); // uma passada resolve os três — não 3
  expect(resultado.sucesso).toBe(true);
  expect(resultado.estrategias).toEqual(
    expect.arrayContaining(['REMOVER_ASSINATURA', 'CONVERTER_PDFA', 'COMPRIMIR_PDF']),
  );
});

test('25 MB com imagens -> corrigido < 10 MB, com aviso de resolução', async () => {
  let chamada = 0;
  const motor = motorFake(() => {
    chamada++;
    // só a 3ª tentativa (screen 72) fica abaixo do limite
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

test('impossível comprimir em 4 tentativas -> correcao_falhou com menor tamanho', async () => {
  const motor = motorFake(() => ({ codigo: 0, bytes: new Uint8Array(LIMITES.TAMANHO_MAX_BYTES + 1000), log: '' }));
  const { resultado, bytesCorrigidos } = await corrigirPdf({
    nomeArquivo: 'grande.pdf',
    bytes: new Uint8Array(20 * 1024 * 1024),
    ocorrencias: [oc('TAMANHO_EXCEDIDO', 'COMPRIMIR_PDF')],
    motor,
  });
  expect(motor.chamadas).toBe(4);
  expect(resultado.sucesso).toBe(false);
  expect(bytesCorrigidos).toBeNull();
  expect(resultado.avisos.join(' ')).toMatch(/menor tamanho alcançado/i);
});

test('motor retorna código 0 mas a saída falha na revalidação -> correcao_falhou (teste mais importante)', async () => {
  // devolve o próprio assinado.pdf: revalidação encontra ASSINATURA_PRESENTE
  const motor = motorFake(() => ({ codigo: 0, bytes: lerFixture('assinado.pdf'), log: '' }));
  const { resultado, bytesCorrigidos } = await corrigirPdf({
    nomeArquivo: 'assinado.pdf',
    bytes: lerFixture('assinado.pdf'),
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA')],
    motor,
  });
  expect(resultado.revalidacao.apto).toBe(false);
  expect(resultado.sucesso).toBe(false);
  expect(bytesCorrigidos).toBeNull();
});

test('emite as mensagens de etapa da spec §6', async () => {
  const etapas: string[] = [];
  const motor = motorFake(() => ({ codigo: 0, bytes: limpo(), log: '' }));
  await corrigirPdf({
    nomeArquivo: 'assinado.pdf',
    bytes: lerFixture('assinado.pdf'),
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA'), oc('TAMANHO_EXCEDIDO', 'COMPRIMIR_PDF')],
    motor,
    onEtapa: (m) => etapas.push(m),
  });
  expect(etapas.some((e) => /Comprimindo — tentativa 1 de 4…/.test(e))).toBe(true);
  expect(etapas).toContain('Revalidando o arquivo corrigido…');
});

/** Uint8Array de `n` bytes que começa com %PDF- para não quebrar detectarTipo. */
function preencherComoPdf(n: number): Uint8Array {
  const b = new Uint8Array(n);
  b.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37], 0);
  return b;
}
