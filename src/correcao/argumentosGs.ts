import type { EstrategiaCorrecao, Ocorrencia } from '../tipos';
import type { NivelCompressao } from '../config/limites';

/**
 * Monta a linha de comando ÚNICA do motor (spec §8.1). Não ramifica "três
 * operações": sempre produz o conjunto completo (remover assinatura, converter
 * para PDF/A-2b, comprimir no nível pedido). As `ocorrencias` só ajustam
 * detalhes de mensagem/estratégia — a reescrita é sempre integral.
 */
export function argumentosGs(params: {
  ocorrencias: Ocorrencia[];
  nivel: NivelCompressao;
}): string[] {
  const { nivel } = params;
  const args = [
    '-dNOPAUSE',
    '-dBATCH',
    '-dQUIET',
    '-sDEVICE=pdfwrite',
    // PDF/A-2b em uma passada
    '-dPDFA=2',
    '-dPDFACompatibilityPolicy=1',
    '-sColorConversionStrategy=UseDeviceIndependentColor',
    // compressão
    `-dPDFSETTINGS=${nivel.pdfsettings}`,
  ];

  if (nivel.dpi !== null) {
    args.push(
      '-dDownsampleColorImages=true',
      `-dColorImageResolution=${nivel.dpi}`,
      '-dDownsampleGrayImages=true',
      `-dGrayImageResolution=${nivel.dpi}`,
      '-dDownsampleMonoImages=true',
      `-dMonoImageResolution=${Math.max(nivel.dpi * 2, 300)}`,
    );
  }

  // A reescrita descarta assinatura e /Perms como efeito colateral (§8.1).
  // Nada de preservar anotações de assinatura:
  args.push('-dPrinted=false');

  args.push('-sOutputFile=/saida.pdf', '/entrada.pdf');
  return args;
}

/** Estratégias aplicadas, derivadas das ocorrências (para o contrato de saída §12). */
export function estrategiasDe(ocorrencias: Ocorrencia[], comprimiu: boolean): EstrategiaCorrecao[] {
  const cod = new Set(ocorrencias.map((o) => o.codigo));
  const est: EstrategiaCorrecao[] = [];
  if (cod.has('ASSINATURA_PRESENTE') || cod.has('RESTRICAO_DOCMDP')) est.push('REMOVER_ASSINATURA');
  est.push('CONVERTER_PDFA'); // a passada sempre regenera o PDF/A
  if (comprimiu) est.push('COMPRIMIR_PDF');
  return est;
}
