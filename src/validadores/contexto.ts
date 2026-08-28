import type { TipoDetectado, ConformidadePdfa } from '../tipos';
import { PDFA } from '../config/limites';
import { carregarPdf, varrerTrailerBruto, type CargaPdf, type TrailerBruto } from '../pdf/estrutura';
import { extrairXmp, lerPdfaId } from '../pdf/xmp';

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
  config: ConfigValidacao;
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
  return { nomeArquivo, bytes, tamanhoBytes: bytes.length, tipo, pdf, config };
}
