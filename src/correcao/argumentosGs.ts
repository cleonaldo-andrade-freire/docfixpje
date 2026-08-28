import type { EstrategiaCorrecao, Ocorrencia } from '../tipos';
import type { NivelCompressao } from '../config/limites';

/**
 * Estratégias de reescrita, da melhor para a mais agressiva. `corrigirPdf` tenta
 * uma a uma até o arquivo de saída revalidar; assim um PDF assinado SEMPRE é
 * corrigido, sem intervenção do usuário (spec §8.2 fallback, automatizado).
 *
 * - `pdfa`        : PDF/A-2b em uma passada (remove assinatura + PDF/A + comprime)
 * - `limpo`       : reescrita simples, sem PDF/A — descarta anotações/assinatura,
 *                   preserva o texto. Mais robusta que a PDF/A em PDFs "difíceis".
 * - `rasterizado` : renderiza as páginas em imagem (equivale à impressora
 *                   virtual). Remove a assinatura por construção; o texto deixa
 *                   de ser selecionável. Último recurso, só para PDF assinado.
 */
export type EstrategiaReescrita = 'pdfa' | 'limpo' | 'rasterizado';

export const ESTRATEGIAS_REESCRITA: readonly EstrategiaReescrita[] = ['pdfa', 'limpo', 'rasterizado'];

/** A estratégia exige que o texto continue extraível para ser aceita? */
export function exigeTextoPreservado(e: EstrategiaReescrita): boolean {
  return e !== 'rasterizado';
}

export function argumentosGs(params: {
  estrategia: EstrategiaReescrita;
  nivel: NivelCompressao;
}): string[] {
  const { estrategia, nivel } = params;
  const base = ['-dNOPAUSE', '-dBATCH', '-dQUIET'];

  if (estrategia === 'rasterizado') {
    const dpi = nivel.dpi ?? 150;
    return [
      ...base,
      '-sDEVICE=pdfimage24',
      `-r${dpi}`,
      '-dPDFSETTINGS=/ebook',
      '-sOutputFile=/saida.pdf',
      '/entrada.pdf',
    ];
  }

  const args = [...base, '-sDEVICE=pdfwrite', `-dPDFSETTINGS=${nivel.pdfsettings}`];

  if (estrategia === 'pdfa') {
    args.push(
      '-dPDFA=2',
      '-dPDFACompatibilityPolicy=1',
      '-sColorConversionStrategy=UseDeviceIndependentColor',
    );
  } else {
    // reescrita limpa: descarta formulários e anotações (inclui o widget da
    // assinatura), sem exigir conformidade PDF/A.
    args.push('-dPreserveAnnots=false');
  }

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

  args.push('-dPrinted=false', '-sOutputFile=/saida.pdf', '/entrada.pdf');
  return args;
}

/** Estratégias aplicadas, derivadas das ocorrências (para o contrato de saída §12). */
export function estrategiasDe(ocorrencias: Ocorrencia[], comprimiu: boolean): EstrategiaCorrecao[] {
  const cod = new Set(ocorrencias.map((o) => o.codigo));
  const est: EstrategiaCorrecao[] = [];
  if (cod.has('ASSINATURA_PRESENTE') || cod.has('RESTRICAO_DOCMDP')) est.push('REMOVER_ASSINATURA');
  est.push('CONVERTER_PDFA');
  if (comprimiu) est.push('COMPRIMIR_PDF');
  return est;
}
