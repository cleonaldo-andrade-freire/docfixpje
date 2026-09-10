/// <reference lib="webworker" />
import type { ParaCorrecao, DaCorrecao } from '../correcao/protocoloCorrecao';
import { corrigirMidia } from '../correcao/corrigirMidia';

/**
 * Worker de correção de vídeo. Separado do `pdf.worker.ts` de propósito: o
 * remux não precisa do Ghostscript, e um worker próprio evita baixar o motor
 * wasm inteiro para converter um .mov. Um worker por operação, terminado ao
 * fim (spec §9.2).
 */

self.onmessage = (ev: MessageEvent<ParaCorrecao>) => {
  const post = (m: DaCorrecao) => {
    const transfer = m.tipo === 'resultado' && m.bufferCorrigido ? [m.bufferCorrigido] : [];
    (self as unknown as Worker).postMessage(m, transfer);
  };

  if (ev.data.tipo !== 'corrigir') return;
  const msg = ev.data;

  void (async () => {
    try {
      const { resultado, bytesCorrigidos } = await corrigirMidia({
        nomeArquivo: msg.nomeArquivo,
        bytes: new Uint8Array(msg.buffer),
        ...(msg.config ? { config: msg.config } : {}),
        onEtapa: (mensagem) => post({ tipo: 'etapa', mensagem }),
      });

      let bufferCorrigido: ArrayBuffer | null = null;
      if (bytesCorrigidos) {
        const copia = new ArrayBuffer(bytesCorrigidos.byteLength);
        new Uint8Array(copia).set(bytesCorrigidos);
        bufferCorrigido = copia;
      }

      post({ tipo: 'resultado', resultado, bufferCorrigido });
    } catch (e) {
      post({ tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) });
    }
  })();
};
