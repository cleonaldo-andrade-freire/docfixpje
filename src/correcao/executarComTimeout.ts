export const TIMEOUT = Symbol('timeout');

/**
 * Corre `promessa` contra um relógio. Se estourar `ms`, chama `aoEstourar`
 * (no orquestrador: `worker.terminate()`) e resolve com o sentinela `TIMEOUT`
 * (spec §8.3.6).
 */
export function executarComTimeout<T>(
  promessa: Promise<T>,
  ms: number,
  aoEstourar: () => void,
): Promise<T | typeof TIMEOUT> {
  return new Promise((resolve) => {
    let terminou = false;
    const t = setTimeout(() => {
      if (terminou) return;
      terminou = true;
      try {
        aoEstourar();
      } finally {
        resolve(TIMEOUT);
      }
    }, ms);

    promessa.then(
      (v) => {
        if (terminou) return;
        terminou = true;
        clearTimeout(t);
        resolve(v);
      },
      () => {
        if (terminou) return;
        terminou = true;
        clearTimeout(t);
        resolve(TIMEOUT);
      },
    );
  });
}
