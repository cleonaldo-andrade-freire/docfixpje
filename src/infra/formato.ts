import type { TipoDetectado } from '../tipos';

/** Formatação de tamanho de arquivo em pt-BR, com 2 casas para KB/MB (spec §1.7). */
export function formatarTamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2).replace('.', ',')} KB`;
  return `${bytes} B`;
}

/**
 * Nome curto e legível do tipo detectado. QuickTime aparece como "MOV" mesmo
 * quando o arquivo se chama .mp4 — é a primeira pista visível de que a extensão
 * está mentindo sobre o conteúdo.
 */
export function tipoLegivel(tipo: TipoDetectado | null): string {
  switch (tipo) {
    case 'application/pdf':
      return 'PDF';
    case 'audio/mpeg':
      return 'MP3';
    case 'video/mp4':
      return 'MP4';
    case 'video/quicktime':
      return 'MOV';
    default:
      return 'desconhecido';
  }
}
