/// <reference lib="webworker" />
import type { ParaCorrecao, DaCorrecao } from '../correcao/protocoloCorrecao';
import { carregarMotor, motorJaCarregado, MotorIndisponivel } from '../correcao/motor';
import { corrigirPdf } from '../correcao/corrigirPdf';

/**
 * Worker de correção. Um worker por operação (spec §9.2): terminá-lo libera a
 * memória linear do WASM. Carrega o motor sob demanda; "Carregando o motor de
 * correção…" só na primeira vez da sessão (spec §6).
 */

export async function processarCorrecao(
  msg: ParaCorrecao,
  responder: (m: DaCorrecao) => void,
): Promise<void> {
  try {
    if (!motorJaCarregado()) responder({ tipo: 'etapa', mensagem: 'Carregando o motor de correção…' });

    let motor;
    try {
      motor = await carregarMotor((frac) => responder({ tipo: 'motorCarregando', frac }));
    } catch (e) {
      if (e instanceof MotorIndisponivel) {
        responder({ tipo: 'motorIndisponivel' });
        return;
      }
      throw e;
    }

    const { resultado, bytesCorrigidos } = await corrigirPdf({
      nomeArquivo: msg.nomeArquivo,
      bytes: new Uint8Array(msg.buffer),
      ocorrencias: msg.ocorrencias,
      motor,
      ...(msg.config ? { config: msg.config } : {}),
      onEtapa: (mensagem) => responder({ tipo: 'etapa', mensagem }),
    });

    let bufferCorrigido: ArrayBuffer | null = null;
    if (bytesCorrigidos) {
      const copia = new ArrayBuffer(bytesCorrigidos.byteLength);
      new Uint8Array(copia).set(bytesCorrigidos);
      bufferCorrigido = copia;
    }

    responder({ tipo: 'resultado', resultado, bufferCorrigido });
  } catch (e) {
    responder({ tipo: 'erro', mensagem: e instanceof Error ? e.message : String(e) });
  }
}

if (typeof self !== 'undefined' && 'onmessage' in self) {
  self.onmessage = (ev: MessageEvent<ParaCorrecao>) => {
    void processarCorrecao(ev.data, (m) => {
      const transfer =
        m.tipo === 'resultado' && m.bufferCorrigido ? [m.bufferCorrigido] : [];
      (self as unknown as Worker).postMessage(m, transfer);
    });
  };
}
