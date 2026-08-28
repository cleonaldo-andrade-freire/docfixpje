import type { EstrategiaCorrecao, Ocorrencia } from '../tipos';
import type { NivelCompressao } from '../config/limites';

/**
 * Estratégias de reescrita, da mais fiel para a mais agressiva. `corrigirPdf`
 * tenta uma a uma até o arquivo de saída revalidar; assim um PDF assinado
 * SEMPRE é corrigido, sem intervenção do usuário e sem perda de qualidade
 * desnecessária.
 *
 * - `fiel`        : pdfwrite sem reamostrar imagem, JPEGs originais preservados
 *                   (pass-through). Descarta a camada de assinatura. É a padrão
 *                   quando o arquivo não precisa encolher — mantém a qualidade.
 * - `pdfa`        : idem + PDF/A-2b. Só entra se `fiel` não produzir um arquivo
 *                   apto.
 * - `comprimir`   : reamostra e recomprime por níveis (/ebook → /screen). Só
 *                   entra quando o arquivo passa do limite de tamanho.
 * - `rasterizado` : renderiza as páginas em imagem (impressora virtual). Remove
 *                   a assinatura por construção; o texto deixa de ser
 *                   selecionável. Último recurso, só para PDF assinado.
 */
export type EstrategiaReescrita = 'fiel' | 'pdfa' | 'comprimir' | 'rasterizado';

/** A estratégia exige que o texto continue extraível para ser aceita? */
export function exigeTextoPreservado(e: EstrategiaReescrita): boolean {
  return e !== 'rasterizado';
}

/** A estratégia pode reduzir a fidelidade das imagens? */
export function podeReduzirQualidade(e: EstrategiaReescrita): boolean {
  return e === 'comprimir' || e === 'rasterizado';
}

const SEM_REAMOSTRAGEM = [
  '-dDownsampleColorImages=false',
  '-dDownsampleGrayImages=false',
  '-dDownsampleMonoImages=false',
  '-dAutoFilterColorImages=false',
  '-dAutoFilterGrayImages=false',
  '-dPassThroughJPEGImages=true',
  '-dPassThroughJPXImages=true',
];

export function argumentosGs(params: {
  estrategia: EstrategiaReescrita;
  nivel: NivelCompressao;
}): string[] {
  const { estrategia, nivel } = params;
  // -sPDFPassword= (vazio): abre PDFs criptografados só com senha de dono /
  // restrições (CTPS Digital, gov.br). A reescrita já sai sem cifra.
  const base = ['-dNOPAUSE', '-dBATCH', '-dQUIET', '-sPDFPassword='];

  if (estrategia === 'rasterizado') {
    return [
      ...base,
      '-sDEVICE=pdfimage24',
      `-r${nivel.dpi ?? 300}`,
      '-sOutputFile=/saida.pdf',
      '/entrada.pdf',
    ];
  }

  const args = [...base, '-sDEVICE=pdfwrite', '-dPreserveAnnots=false', '-dPrinted=false'];

  if (estrategia === 'comprimir') {
    args.push(`-dPDFSETTINGS=${nivel.pdfsettings}`);
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
  } else {
    // fiel / pdfa: qualidade máxima, sem tocar nas imagens.
    args.push('-dPDFSETTINGS=/prepress', ...SEM_REAMOSTRAGEM);
    if (estrategia === 'pdfa') {
      args.push('-dPDFA=2', '-dPDFACompatibilityPolicy=1');
    }
  }

  args.push('-sOutputFile=/saida.pdf', '/entrada.pdf');
  return args;
}

/** Estratégias aplicadas, derivadas das ocorrências (para o contrato de saída §12). */
export function estrategiasDe(params: {
  ocorrencias: Ocorrencia[];
  comprimiu: boolean;
  converteuPdfa: boolean;
}): EstrategiaCorrecao[] {
  const cod = new Set(params.ocorrencias.map((o) => o.codigo));
  const est: EstrategiaCorrecao[] = [];
  if (cod.has('ASSINATURA_PRESENTE') || cod.has('RESTRICAO_DOCMDP')) est.push('REMOVER_ASSINATURA');
  if (params.converteuPdfa) est.push('CONVERTER_PDFA');
  if (params.comprimiu) est.push('COMPRIMIR_PDF');
  return est;
}
