import { describe, expect, test, vi } from 'vitest';
import { corrigirPdf, nomeCorrigido } from './corrigirPdf';
import { argumentosGs } from './argumentosGs';
import type { MotorPdf, SaidaMotor } from './motor';
import type { Ocorrencia } from '../tipos';
import { COMPRESSAO_TENTATIVAS, LIMITES, type NivelCompressao } from '../config/limites';
import { lerFixture } from '../../scripts/lib/ler-fixture';

const NIVEL: NivelCompressao = { rotulo: 'x', pdfsettings: '/ebook', dpi: null };

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
): MotorPdf & { chamadas: number } {
  const m = {
    chamadas: 0,
    executar: vi.fn(async (entrada: Uint8Array, args: string[]) => {
      m.chamadas++;
      return saida(entrada, args);
    }),
  };
  return m as unknown as MotorPdf & { chamadas: number };
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
const ehPdfa = (args: string[]) => args.includes('-dPDFA=2');
const ehComprimir = (args: string[]) => args.some((a) => a.startsWith('-dColorImageResolution='));

describe('argumentosGs — estratégias', () => {
  test('fiel: pdfwrite, /prepress, SEM reamostrar imagem, sem PDF/A', () => {
    const args = argumentosGs({ estrategia: 'fiel', nivel: NIVEL });
    expect(args).toContain('-sDEVICE=pdfwrite');
    expect(args).toContain('-dPDFSETTINGS=/prepress');
    expect(args).toContain('-dDownsampleColorImages=false');
    expect(args).toContain('-dPassThroughJPEGImages=true');
    expect(args).not.toContain('-dPDFA=2');
    expect(args.join(' ')).not.toMatch(/-dColorImageResolution/);
  });
  test('pdfa: fiel + PDF/A-2b', () => {
    const args = argumentosGs({ estrategia: 'pdfa', nivel: NIVEL });
    expect(args).toContain('-dPDFA=2');
    expect(args).toContain('-dDownsampleColorImages=false');
  });
  test('comprimir: reamostra no nível pedido', () => {
    const args = argumentosGs({ estrategia: 'comprimir', nivel: COMPRESSAO_TENTATIVAS[2]! });
    expect(args).toContain('-dPDFSETTINGS=/screen');
    expect(args).toContain('-dColorImageResolution=72');
    expect(args).toContain('-dDownsampleColorImages=true');
  });
  test('rasterizado: pdfimage24', () => {
    const args = argumentosGs({ estrategia: 'rasterizado', nivel: NIVEL });
    expect(args).toContain('-sDEVICE=pdfimage24');
    expect(args.join(' ')).toMatch(/-r\d+/);
  });
});

test('nomeCorrigido: documento.pdf -> documento-corrigido.pdf', () => {
  expect(nomeCorrigido('documento.pdf')).toBe('documento-corrigido.pdf');
  expect(nomeCorrigido('ctps-digital.PDF')).toBe('ctps-digital-corrigido.PDF');
});

test('PDF assinado (não oversized) -> corrigido pela estratégia FIEL, 1 invocação, sem tocar imagem', async () => {
  const motor = motorFake((entrada, args) => {
    expect(ehComprimir(args)).toBe(false); // nunca comprime um arquivo pequeno
    return { codigo: 0, bytes: reescreverSemAssinatura(entrada), log: '' };
  });
  const { resultado, bytesCorrigidos } = await corrigirPdf({
    nomeArquivo: 'assinado.pdf',
    bytes: assinado(),
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA')],
    motor,
  });
  expect(resultado.sucesso).toBe(true);
  expect(resultado.textoPreservado).toBe(true);
  expect(resultado.avisos).toEqual([]); // sem aviso de qualidade
  expect(resultado.estrategias).toContain('REMOVER_ASSINATURA');
  expect(resultado.estrategias).not.toContain('CONVERTER_PDFA'); // fiel não é PDF/A
  expect(motor.chamadas).toBe(1);
  expect(bytesCorrigidos).not.toBeNull();
});

test('fiel falha (mantém assinatura) -> tenta PDF/A', async () => {
  const motor = motorFake((entrada, args) => ({
    codigo: 0,
    bytes: ehPdfa(args) ? reescreverSemAssinatura(entrada) : entrada.slice(),
    log: '',
  }));
  const { resultado } = await corrigirPdf({
    nomeArquivo: 'assinado.pdf',
    bytes: assinado(),
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA')],
    motor,
  });
  expect(resultado.sucesso).toBe(true);
  expect(resultado.estrategias).toContain('CONVERTER_PDFA');
  expect(motor.chamadas).toBe(2);
});

test('fiel e PDF/A perdem o texto -> rasteriza, com aviso; correção não falha', async () => {
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
  expect(motor.chamadas).toBe(3);
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

test('não-PDF/A sem assinatura -> corrigido pela estratégia fiel', async () => {
  const motor = motorFake(() => ({ codigo: 0, bytes: pdfaOk(), log: '' }));
  const { resultado } = await corrigirPdf({
    nomeArquivo: 's.pdf',
    bytes: limpo(),
    ocorrencias: [oc('PDFA_NAO_DECLARADO')],
    motor,
  });
  expect(resultado.sucesso).toBe(true);
  expect(motor.chamadas).toBe(1);
});

test('assinado + acima do limite -> fiel/pdfa não cabem, comprime; aviso de resolução', async () => {
  const base = assinado();
  const inflado = new Uint8Array(LIMITES.TAMANHO_MAX_BYTES + 1);
  inflado.set(base, 0);
  let chamada = 0;
  const motor = motorFake((entrada, args) => {
    chamada++;
    const limpoBytes = reescreverSemAssinatura(entrada.subarray(0, base.length + 200));
    if (!ehComprimir(args)) {
      // fiel/pdfa: devolve algo ainda acima do limite
      const grande = new Uint8Array(LIMITES.TAMANHO_MAX_BYTES + 100);
      grande.set(limpoBytes.subarray(0, Math.min(limpoBytes.length, grande.length)), 0);
      return { codigo: 0, bytes: grande, log: '' };
    }
    // comprimir: a partir da 3ª tentativa cabe
    return chamada >= 5
      ? { codigo: 0, bytes: limpoBytes, log: '' }
      : { codigo: 0, bytes: new Uint8Array(LIMITES.TAMANHO_MAX_BYTES + 50), log: '' };
  });
  const { resultado } = await corrigirPdf({
    nomeArquivo: 'grande.pdf',
    bytes: inflado,
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA'), oc('TAMANHO_EXCEDIDO', 'COMPRIMIR_PDF')],
    motor,
  });
  expect(resultado.sucesso).toBe(true);
  expect(resultado.estrategias).toContain('COMPRIMIR_PDF');
  expect(resultado.avisos.join(' ')).toMatch(/resolução das imagens/i);
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
    ocorrencias: [oc('ASSINATURA_PRESENTE', 'REMOVER_ASSINATURA')],
    motor,
    onEtapa: (m) => etapas.push(m),
  });
  expect(etapas).toContain('Removendo a assinatura…');
  expect(etapas).toContain('Revalidando o arquivo corrigido…');
});
