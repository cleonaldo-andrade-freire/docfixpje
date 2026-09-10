import type { TipoDetectado, ConformidadePdfa } from '../tipos';
import { PDFA } from '../config/limites';
import { carregarPdf, varrerTrailerBruto, type CargaPdf, type TrailerBruto } from '../pdf/estrutura';
import { extrairXmp, lerPdfaId } from '../pdf/xmp';
import { analisarMidia, type AnaliseMidia } from '../midia/remuxarMp4';

export interface ConfigValidacao {
  pdfa: {
    pdfaObrigatorio: boolean;
    pdfaGravidade: 'erro' | 'aviso';
    pdfaPartesAceitas: number[];
  };
}

export const CONFIG_PADRAO: ConfigValidacao = {
  pdfa: {
    pdfaObrigatorio: PDFA.pdfaObrigatorio,
    pdfaGravidade: PDFA.pdfaGravidade,
    pdfaPartesAceitas: [...PDFA.pdfaPartesAceitas],
  },
};

export interface ContextoPdf {
  carga: CargaPdf;
  trailer: TrailerBruto;
  xmp: string | null;
  pdfaId: { parte: number; conformidade: ConformidadePdfa } | null;
}

export interface ContextoArquivo {
  nomeArquivo: string;
  bytes: Uint8Array;
  tamanhoBytes: number;
  tipo: TipoDetectado | null;
  /** null quando não é PDF. */
  pdf: ContextoPdf | null;
  /** null quando não é MP4/MOV. */
  midia: AnaliseMidia | null;
  config: ConfigValidacao;
}

/** Tipos que passam pelo analisador de container ISO BMFF. */
export function ehVideo(tipo: TipoDetectado | null): boolean {
  return tipo === 'video/mp4' || tipo === 'video/quicktime';
}

/** Tipos com o teto de tamanho de mídia, não o de PDF. */
export function ehMidia(tipo: TipoDetectado | null): boolean {
  return tipo === 'audio/mpeg' || ehVideo(tipo);
}

export async function montarContexto(
  nomeArquivo: string,
  bytes: Uint8Array,
  tipo: TipoDetectado | null,
  config: ConfigValidacao = CONFIG_PADRAO,
): Promise<ContextoArquivo> {
  let pdf: ContextoPdf | null = null;
  if (tipo === 'application/pdf') {
    const carga = await carregarPdf(bytes);
    const trailer = varrerTrailerBruto(bytes);
    const xmp = extrairXmp(bytes);
    const pdfaId = xmp ? lerPdfaId(xmp) : null;
    pdf = { carga, trailer, xmp, pdfaId };
  }

  const midia = ehVideo(tipo) ? analisarMidia(bytes) : null;

  return { nomeArquivo, bytes, tamanhoBytes: bytes.length, tipo, pdf, midia, config };
}
