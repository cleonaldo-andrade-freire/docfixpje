/**
 * Registro central de Blob URLs com revogação garantida (spec §9.4).
 * É o único vazamento que o navegador não resolve sozinho antes do unload.
 */

const urls = new Map<string, string>();

export function criarDownload(id: string, blob: Blob, nome: string): { url: string; nome: string } {
  descartar(id);
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return { url, nome };
}

export function descartar(id: string): void {
  const url = urls.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urls.delete(id);
  }
}

export function descartarTudo(): void {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}

/** Para testes e diagnóstico. */
export function contarAtivos(): number {
  return urls.size;
}

if (typeof addEventListener === 'function') {
  addEventListener('pagehide', descartarTudo);
}
