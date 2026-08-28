/** `documento.pdf` -> `documento-corrigido.pdf` (spec §8.3.4). Sem dependências pesadas. */
export function nomeCorrigido(nome: string): string {
  const i = nome.lastIndexOf('.');
  return i === -1 ? `${nome}-corrigido` : `${nome.slice(0, i)}-corrigido${nome.slice(i)}`;
}
