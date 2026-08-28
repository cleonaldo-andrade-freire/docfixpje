/// <reference lib="webworker" />
import type { ParaWorker, DoWorker } from './protocolo';
import { validarArquivo } from '../validadores/validarArquivo';

/**
 * Worker de validação. Um worker por arquivo (spec §9.2): terminá-lo libera o
 * heap inteiro. Não importa nada de src/ui nem de react.
 */

export async function processarValidacao(
  msg: ParaWorker,
  responder: (m: DoWorker) => void,
): Promise<void> {
  try {
    const resultado = await validarArquivo(msg.nomeArquivo, msg.buffer, {
      onEtapa: (mensagem) => responder({ tipo: 'etapa', mensagem }),
    });
    responder({ tipo: 'resultado', resultado });
  } catch (e) {
    responder({ tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) });
  }
}

// Registro do listener só quando de fato rodando como worker.
if (typeof self !== 'undefined' && 'onmessage' in self) {
  self.onmessage = (ev: MessageEvent<ParaWorker>) => {
    void processarValidacao(ev.data, (m) => (self as unknown as Worker).postMessage(m));
  };
}
