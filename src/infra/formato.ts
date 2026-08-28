/** Formatação de tamanho de arquivo em pt-BR, com 2 casas para KB/MB (spec §1.7). */
export function formatarTamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2).replace('.', ',')} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2).replace('.', ',')} KB`;
  return `${bytes} B`;
}

/** Nome curto e legível do tipo detectado. */
export function tipoLegivel(tipo: 'application/pdf' | 'audio/mpeg' | 'video/mp4' | null): string {
  switch (tipo) {
    case 'application/pdf':
      return 'PDF';
    case 'audio/mpeg':
      return 'MP3';
    case 'video/mp4':
      return 'MP4';
    default:
      return 'desconhecido';
  }
}
