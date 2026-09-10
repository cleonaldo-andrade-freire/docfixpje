import type { TipoDetectado } from '../tipos';

/** `documento.pdf` -> `documento-corrigido.pdf` (spec §8.3.4). Sem dependências pesadas. */
export function nomeCorrigido(nome: string): string {
  const i = nome.lastIndexOf('.');
  return i === -1 ? `${nome}-corrigido` : `${nome.slice(0, i)}-corrigido${nome.slice(i)}`;
}

/**
 * Nome e MIME do arquivo de saída.
 *
 * Vídeo exige tratamento próprio: a entrada chega como `.MOV` ou `.MP4`
 * maiúsculo e o que sai do remux é MP4 de verdade, então a extensão é
 * normalizada para `.mp4`. Sem isso o usuário baixaria um MP4 legítimo com
 * nome de QuickTime — exatamente a confusão que causou o problema.
 */
export function saidaCorrigida(
  nome: string,
  tipo: TipoDetectado | null,
): { nome: string; mime: string } {
  if (tipo === 'video/mp4' || tipo === 'video/quicktime') {
    const comSufixo = nomeCorrigido(nome);
    const i = comSufixo.lastIndexOf('.');
    return { nome: i === -1 ? `${comSufixo}.mp4` : `${comSufixo.slice(0, i)}.mp4`, mime: 'video/mp4' };
  }
  if (tipo === 'audio/mpeg') return { nome: nomeCorrigido(nome), mime: 'audio/mpeg' };
  return { nome: nomeCorrigido(nome), mime: 'application/pdf' };
}
