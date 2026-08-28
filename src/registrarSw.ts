/** Registra o service worker fora do caminho crítico (spec §11). */
export function registrarSw(): void {
  if (!('serviceWorker' in navigator)) return;
  if (import.meta.env.DEV) return; // sem SW em desenvolvimento
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline é melhor-esforço; falha no registro não quebra a aplicação */
    });
  });
}
