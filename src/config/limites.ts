/**
 * Fonte ÚNICA de constantes numéricas do projeto (spec §1.6, §7.2, §10.2).
 * Nenhum limite literal deve existir fora deste arquivo.
 */

export const LIMITES = {
  /** Teto de tamanho por arquivo. Os tribunais divergem; alterar só aqui. (spec §7.2) */
  TAMANHO_MAX_BYTES: 10 * 1024 * 1024,

  /**
   * Acima disto a ferramenta recusa sem sequer ler os bytes — um arquivo desse
   * porte reprova por tamanho de qualquer forma (spec §10.2).
   */
  TAMANHO_ABSOLUTO_LEITURA_BYTES: 100 * 1024 * 1024,

  /** Máximo de arquivos aceitos por lote (auto-DoS do navegador, spec §10.2). */
  MAX_ARQUIVOS_LOTE: 20,

  /** Timer de inatividade que descarta a sessão (spec §9.5). */
  OCIOSIDADE_MS: 30 * 60 * 1000,

  /** Atraso para revogar a Blob URL após o clique de download (spec §9.4). */
  REVOGACAO_BLOB_DELAY_MS: 30 * 1000,

  /** Limite de tempo de uma correção de PDF antes de abortar (spec §8.3.6). Fase 2. */
  TIMEOUT_CORRECAO_PDF_MS: 120_000,
} as const;

export const PDFA = {
  /** Se falso, a Regra 3 não produz nenhuma ocorrência (spec §7.3). */
  pdfaObrigatorio: true,

  /**
   * Gravidade das ocorrências da Regra 3. Padrão de fábrica: 'aviso' — muitos
   * tribunais aceitam PDF comum, e cravar 'erro' treina o usuário a ignorar o
   * diagnóstico (spec §7.3).
   */
  pdfaGravidade: 'aviso' as 'erro' | 'aviso',

  /** Partes da ISO 19005 aceitas na declaração XMP (spec §7.3). */
  pdfaPartesAceitas: [1, 2, 3, 4] as number[],
} as const;
