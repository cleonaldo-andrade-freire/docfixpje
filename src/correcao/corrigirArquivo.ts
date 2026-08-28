import type { Ocorrencia, ResultadoCorrecao, TipoDetectado } from '../tipos';
import type { EstadoLinha } from '../estado/maquinaLinha';
import type { ConfigValidacao } from '../validadores/contexto';
import { LIMITES } from '../config/limites';
import { executarComTimeout, TIMEOUT } from './executarComTimeout';
import type { ParaCorrecao, DaCorrecao } from './protocoloCorrecao';

/**
 * Entrypoint de correção, desacoplado do motor e da UI (spec §15).
 * Roteia os casos não-corrigíveis antes de acionar qualquer worker.
 */

export interface CallbacksCorrecao {
  onEtapa: (m: string) => void;
  onMotorCarregando?: (frac: number) => void;
}

export type FabricaWorkerCorrecao = () => Worker;

export interface SaidaCorrecao {
  estadoDestino: EstadoLinha;
  resultado: ResultadoCorrecao | null;
  bufferCorrigido: ArrayBuffer | null;
  /** Orientação manual quando não deu para corrigir. */
  orientacao?: string;
}

const RESULTADO_VAZIO: ResultadoCorrecao = {
  tentada: false,
  estrategias: [],
  sucesso: false,
  tamanhoAntes: 0,
  tamanhoDepois: 0,
  textoPreservado: false,
  avisos: [],
  duracaoMs: 0,
  revalidacao: { apto: false, ocorrencias: [] },
};

const fabricaPadrao: FabricaWorkerCorrecao = () =>
  new Worker(new URL('../workers/correcao.worker.ts', import.meta.url), { type: 'module' });

export async function corrigirArquivo(params: {
  nomeArquivo: string;
  tipo: TipoDetectado | null;
  bytes: ArrayBuffer;
  ocorrencias: Ocorrencia[];
  config?: ConfigValidacao;
  cb: CallbacksCorrecao;
  fabricaWorker?: FabricaWorkerCorrecao;
  timeoutMs?: number;
}): Promise<SaidaCorrecao> {
  const { nomeArquivo, tipo, bytes, ocorrencias, config, cb } = params;
  const timeoutMs = params.timeoutMs ?? LIMITES.TIMEOUT_CORRECAO_PDF_MS;

  const cod = new Set(ocorrencias.map((o) => o.codigo));

  if (cod.has('ARQUIVO_CRIPTOGRAFADO') || cod.has('PDFA_CRIPTOGRAFADO')) {
    return {
      estadoDestino: 'nao_corrigivel',
      resultado: { ...RESULTADO_VAZIO },
      bufferCorrigido: null,
      orientacao:
        'O arquivo está protegido por senha. Remova a proteção no aplicativo que o gerou e valide de novo. Esta ferramenta não pede senha nem quebra proteção.',
    };
  }

  if (tipo === 'audio/mpeg' || tipo === 'video/mp4') {
    return {
      estadoDestino: 'nao_corrigivel',
      resultado: { ...RESULTADO_VAZIO },
      bufferCorrigido: null,
      orientacao:
        'Para MP3/MP4 acima do limite, reduza a duração ou recodifique com bitrate menor no seu editor. A recodificação automática de mídia não está disponível nesta versão.',
    };
  }

  const worker = params.fabricaWorker ? params.fabricaWorker() : fabricaPadrao();

  const operacao = new Promise<SaidaCorrecao>((resolve) => {
    worker.onmessage = (ev: MessageEvent<DaCorrecao>) => {
      const m = ev.data;
      switch (m.tipo) {
        case 'etapa':
          cb.onEtapa(m.mensagem);
          break;
        case 'motorCarregando':
          cb.onMotorCarregando?.(m.frac);
          break;
        case 'motorIndisponivel':
          resolve({
            estadoDestino: 'correcao_falhou',
            resultado: { ...RESULTADO_VAZIO, tentada: true },
            bufferCorrigido: null,
            orientacao:
              'A correção automática ainda não está disponível nesta instalação. Siga os passos manuais indicados no diagnóstico.',
          });
          break;
        case 'resultado':
          resolve({
            estadoDestino: m.resultado.sucesso ? 'corrigido' : 'correcao_falhou',
            resultado: m.resultado,
            bufferCorrigido: m.bufferCorrigido,
          });
          break;
        case 'erro':
          resolve({
            estadoDestino: 'correcao_falhou',
            resultado: { ...RESULTADO_VAZIO, tentada: true, avisos: [m.mensagem] },
            bufferCorrigido: null,
          });
          break;
      }
    };
    worker.onerror = () =>
      resolve({
        estadoDestino: 'correcao_falhou',
        resultado: { ...RESULTADO_VAZIO, tentada: true, avisos: ['O worker de correção falhou.'] },
        bufferCorrigido: null,
      });

    const msg: ParaCorrecao = config
      ? { tipo: 'corrigir', nomeArquivo, buffer: bytes, ocorrencias, config }
      : { tipo: 'corrigir', nomeArquivo, buffer: bytes, ocorrencias };
    worker.postMessage(msg, [bytes]);
  });

  try {
    const saida = await executarComTimeout(operacao, timeoutMs, () => worker.terminate());
    if (saida === TIMEOUT) {
      return {
        estadoDestino: 'correcao_falhou',
        resultado: {
          ...RESULTADO_VAZIO,
          tentada: true,
          avisos: ['A correção passou do tempo limite e foi interrompida.'],
        },
        bufferCorrigido: null,
      };
    }
    return saida;
  } finally {
    worker.terminate();
  }
}
