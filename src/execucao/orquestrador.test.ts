import { expect, test, vi } from 'vitest';
import { processarLote, type CallbacksLote, type FabricaWorker } from './orquestrador';
import type { DoWorker, ParaWorker } from '../workers/protocolo';
import type { ResultadoValidacao } from '../tipos';

function resultadoFake(nome: string, apto: boolean): ResultadoValidacao {
  return {
    nomeArquivo: nome,
    tipoDetectado: 'application/pdf',
    tamanhoBytes: 10,
    pdfaParte: null,
    pdfaConformidade: null,
    apto,
    corrigivel: !apto,
    ocorrencias: [],
  };
}

/** Worker falso: responde `resultado` num microtask após receber `validar`. */
class WorkerFake implements Partial<Worker> {
  onmessage: ((ev: MessageEvent<DoWorker>) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  terminado = false;
  constructor(private readonly comportar: (msg: ParaWorker) => DoWorker[]) {}
  postMessage(msg: ParaWorker): void {
    queueMicrotask(() => {
      for (const m of this.comportar(msg)) {
        this.onmessage?.({ data: m } as MessageEvent<DoWorker>);
      }
    });
  }
  terminate(): void {
    this.terminado = true;
  }
}

const file = (nome: string) => new File([new Uint8Array([1, 2, 3])], nome);

function coletor(): CallbacksLote & { estados: [number, string][]; resultados: [number, boolean][] } {
  const estados: [number, string][] = [];
  const resultados: [number, boolean][] = [];
  return {
    estados,
    resultados,
    onEstado: (i, e) => estados.push([i, e]),
    onEtapa: () => {},
    onResultado: (i, r) => resultados.push([i, r.apto]),
  };
}

test('cria e termina um worker por arquivo; nenhum fica vivo', async () => {
  const vivos: WorkerFake[] = [];
  const fabrica: FabricaWorker = () => {
    const w = new WorkerFake((m) => [{ tipo: 'resultado', resultado: resultadoFake(m.nomeArquivo, true) }]);
    vivos.push(w);
    return w as unknown as Worker;
  };
  const cb = coletor();
  await processarLote([file('a.pdf'), file('b.pdf'), file('c.pdf'), file('d.pdf'), file('e.pdf')], cb, fabrica);

  expect(vivos).toHaveLength(5);
  expect(vivos.every((w) => w.terminado)).toBe(true);
  expect(cb.resultados).toEqual([
    [0, true],
    [1, true],
    [2, true],
    [3, true],
    [4, true],
  ]);
});

test('em nenhum instante duas linhas estão em "validando"', async () => {
  const fabrica: FabricaWorker = () =>
    new WorkerFake((m) => [
      { tipo: 'etapa', mensagem: 'Lendo o arquivo…' },
      { tipo: 'resultado', resultado: resultadoFake(m.nomeArquivo, true) },
    ]) as unknown as Worker;
  const cb = coletor();
  await processarLote([file('a'), file('b'), file('c')], cb, fabrica);

  let emValidando = 0;
  for (const [, estado] of cb.estados) {
    if (estado === 'validando') emValidando++;
    if (estado === 'apto' || estado === 'inapto') emValidando--;
    expect(emValidando).toBeLessThanOrEqual(1);
  }
  // sequência por índice: validando 0, apto 0, validando 1, apto 1, ...
  expect(cb.estados).toEqual([
    [0, 'validando'],
    [0, 'apto'],
    [1, 'validando'],
    [1, 'apto'],
    [2, 'validando'],
    [2, 'apto'],
  ]);
});

test('erro do worker no arquivo 2 não interrompe o lote', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const fabrica: FabricaWorker = () => {
    const w = new WorkerFake((m) =>
      m.nomeArquivo === 'b'
        ? [{ tipo: 'erro', mensagem: 'explodiu' }]
        : [{ tipo: 'resultado', resultado: resultadoFake(m.nomeArquivo, true) }],
    );
    return w as unknown as Worker;
  };
  const cb = coletor();
  await expect(processarLote([file('a'), file('b'), file('c')], cb, fabrica)).resolves.toBeUndefined();

  expect(cb.resultados).toEqual([
    [0, true],
    [1, false], // b virou ARQUIVO_CORROMPIDO
    [2, true],
  ]);
});
