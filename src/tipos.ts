/**
 * Contrato de saída da validação e da correção (spec §12).
 * Os validadores produzem `Ocorrencia[]`; o orquestrador monta `ResultadoValidacao`.
 */

export type TipoDetectado = 'application/pdf' | 'audio/mpeg' | 'video/mp4';

export type Gravidade = 'erro' | 'aviso';

export type CodigoOcorrencia =
  | 'ASSINATURA_PRESENTE'
  | 'CAMPO_ASSINATURA_VAZIO'
  | 'RESTRICAO_DOCMDP'
  | 'TAMANHO_EXCEDIDO'
  | 'FORMATO_NAO_SUPORTADO'
  | 'ARQUIVO_CRIPTOGRAFADO'
  | 'ARQUIVO_CORROMPIDO'
  | 'PDFA_NAO_DECLARADO'
  | 'PDFA_DECLARACAO_INCONSISTENTE'
  | 'PDFA_CRIPTOGRAFADO'
  | 'PDFA_SEM_OUTPUTINTENT'
  | 'PDFA_FONTE_NAO_EMBUTIDA'
  | 'PDFA_JAVASCRIPT'
  | 'PDFA_ARQUIVO_EMBUTIDO'
  | 'PDFA_TRANSPARENCIA'
  | 'PDFA_REFERENCIA_EXTERNA';

export type EstrategiaCorrecao =
  | 'REMOVER_ASSINATURA'
  | 'CONVERTER_PDFA'
  | 'COMPRIMIR_PDF'
  | 'RECODIFICAR_MIDIA';

export type ConformidadePdfa = 'A' | 'B' | 'U';

export interface Ocorrencia {
  codigo: CodigoOcorrencia;
  gravidade: Gravidade;
  /** Texto curto para o usuário. */
  mensagem: string;
  /** Detalhe verificável, para quem entende de PDF. Vai dentro de um <details>. */
  detalheTecnico: string;
  /** O que o usuário pode fazer. */
  orientacao: string;
  /** Estratégia de correção automática aplicável, ou null se não houver. */
  correcaoDisponivel: EstrategiaCorrecao | null;
}

export interface RevalidacaoCorrecao {
  apto: boolean;
  ocorrencias: Ocorrencia[];
}

export interface ResultadoCorrecao {
  tentada: boolean;
  estrategias: EstrategiaCorrecao[];
  sucesso: boolean;
  tamanhoAntes: number;
  tamanhoDepois: number;
  textoPreservado: boolean;
  avisos: string[];
  duracaoMs: number;
  revalidacao: RevalidacaoCorrecao;
}

export interface ResultadoValidacao {
  nomeArquivo: string;
  tipoDetectado: TipoDetectado | null;
  tamanhoBytes: number;
  pdfaParte: number | null;
  pdfaConformidade: ConformidadePdfa | null;
  apto: boolean;
  corrigivel: boolean;
  ocorrencias: Ocorrencia[];
  /** Preenchido apenas na Fase 2, após uma tentativa de correção. */
  correcao?: ResultadoCorrecao;
}

export const CODIGOS_OCORRENCIA = [
  'ASSINATURA_PRESENTE',
  'CAMPO_ASSINATURA_VAZIO',
  'RESTRICAO_DOCMDP',
  'TAMANHO_EXCEDIDO',
  'FORMATO_NAO_SUPORTADO',
  'ARQUIVO_CRIPTOGRAFADO',
  'ARQUIVO_CORROMPIDO',
  'PDFA_NAO_DECLARADO',
  'PDFA_DECLARACAO_INCONSISTENTE',
  'PDFA_CRIPTOGRAFADO',
  'PDFA_SEM_OUTPUTINTENT',
  'PDFA_FONTE_NAO_EMBUTIDA',
  'PDFA_JAVASCRIPT',
  'PDFA_ARQUIVO_EMBUTIDO',
  'PDFA_TRANSPARENCIA',
  'PDFA_REFERENCIA_EXTERNA',
] as const satisfies readonly CodigoOcorrencia[];

export const ESTRATEGIAS_CORRECAO = [
  'REMOVER_ASSINATURA',
  'CONVERTER_PDFA',
  'COMPRIMIR_PDF',
  'RECODIFICAR_MIDIA',
] as const satisfies readonly EstrategiaCorrecao[];
