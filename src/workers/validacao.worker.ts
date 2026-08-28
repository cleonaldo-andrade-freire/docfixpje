import type { ParaWorker, DoWorker } from './protocolo';
import { validarArquivo } from '../validadores/validarArquivo';

/**
 * Handler de validação. Roda dentro de `pdf.worker.ts` (worker único). Um worker
 * por arquivo (spec §9.2): terminá-lo libera o heap. Nada de src/ui nem react.
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
