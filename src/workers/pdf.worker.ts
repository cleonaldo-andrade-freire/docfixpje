/// <reference lib="webworker" />
import type { ParaWorker, DoWorker } from './protocolo';
import type { ParaCorrecao, DaCorrecao } from '../correcao/protocoloCorrecao';
import { processarValidacao } from './validacao.worker';
import { processarCorrecao } from './correcao.worker';

/**
 * Worker único de PDF: roteia validação e correção pelo `tipo` da mensagem.
 * Um só script evita embutir o pdf-lib duas vezes. Continua sendo um worker por
 * operação, terminado ao fim (spec §9.2).
 */

type Entrada = ParaWorker | ParaCorrecao;

self.onmessage = (ev: MessageEvent<Entrada>) => {
  const post = (m: DoWorker | DaCorrecao) => {
    const transfer =
      m.tipo === 'resultado' && 'bufferCorrigido' in m && m.bufferCorrigido
        ? [m.bufferCorrigido]
        : [];
    (self as unknown as Worker).postMessage(m, transfer);
  };

  if (ev.data.tipo === 'validar') {
    void processarValidacao(ev.data, post as (m: DoWorker) => void);
  } else if (ev.data.tipo === 'corrigir') {
    void processarCorrecao(ev.data, post as (m: DaCorrecao) => void);
  }
};
