import type { ResultadoValidacao } from '../tipos';
import type { EstadoLinha } from '../estado/maquinaLinha';
import type { DoWorker, ParaWorker } from '../workers/protocolo';

/**
 * Orquestra a validação do lote: UM worker por arquivo, criado e terminado por
 * arquivo (spec §9.2), processados em sequência (spec §5). Em qualquer instante
 * no máximo uma linha está em `validando`.
 */

export interface CallbacksLote {
  onEstado: (indice: number, estado: EstadoLinha) => void;
  onEtapa: (indice: number, mensagem: string) => void;
  onResultado: (indice: number, resultado: ResultadoValidacao) => void;
}

export type FabricaWorker = () => Worker;

const fabricaPadrao: FabricaWorker = () =>
  new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), { type: 'module' });

function resultadoCorrompido(nome: string, tamanhoBytes: number): ResultadoValidacao {
  return {
    nomeArquivo: nome,
    tipoDetectado: null,
    tamanhoBytes,
    pdfaParte: null,
    pdfaConformidade: null,
    apto: false,
    corrigivel: false,
    ocorrencias: [
      {
        codigo: 'ARQUIVO_CORROMPIDO',
        gravidade: 'erro',
        mensagem: 'Não foi possível analisar o arquivo.',
        detalheTecnico: 'o worker de validação falhou ao processar este arquivo',
        orientacao: 'Gere o arquivo de novo na origem e tente outra vez.',
        correcaoDisponivel: null,
      },
    ],
  };
}

async function processarUm(
  indice: number,
  arquivo: File,
  cb: CallbacksLote,
  criar: FabricaWorker,
): Promise<void> {
  cb.onEstado(indice, 'validando');
  const worker = criar();
  try {
    const buffer = await arquivo.arrayBuffer();
    await new Promise<void>((resolve) => {
      const finalizar = (r: ResultadoValidacao) => {
        cb.onResultado(indice, r);
        cb.onEstado(indice, r.apto ? 'apto' : 'inapto');
        resolve();
      };
      worker.onmessage = (ev: MessageEvent<DoWorker>) => {
        const m = ev.data;
        if (m.tipo === 'etapa') cb.onEtapa(indice, m.mensagem);
        else if (m.tipo === 'resultado') finalizar(m.resultado);
        else finalizar(resultadoCorrompido(arquivo.name, arquivo.size));
      };
      worker.onerror = () => finalizar(resultadoCorrompido(arquivo.name, arquivo.size));
      const msg: ParaWorker = { tipo: 'validar', nomeArquivo: arquivo.name, buffer };
      worker.postMessage(msg, [buffer]);
    });
  } catch {
    cb.onResultado(indice, resultadoCorrompido(arquivo.name, arquivo.size));
    cb.onEstado(indice, 'inapto');
  } finally {
    worker.terminate();
  }
}

export async function processarLote(
  arquivos: File[],
  cb: CallbacksLote,
  fabricaWorker: FabricaWorker = fabricaPadrao,
): Promise<void> {
  for (let i = 0; i < arquivos.length; i++) {
    await processarUm(i, arquivos[i]!, cb, fabricaWorker);
  }
}
