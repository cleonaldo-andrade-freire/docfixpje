import { expect, test, vi } from 'vitest';
import { corrigirArquivo, type FabricaWorkerCorrecao } from './corrigirArquivo';
import type { DaCorrecao, ParaCorrecao } from './protocoloCorrecao';
import type { Ocorrencia, ResultadoCorrecao } from '../tipos';

const oc = (codigo: Ocorrencia['codigo']): Ocorrencia => ({
  codigo,
  gravidade: 'erro',
  mensagem: '',
  detalheTecnico: '',
  orientacao: '',
  correcaoDisponivel: 'CONVERTER_PDFA',
});

const buf = () => new Uint8Array([1, 2, 3]).buffer;
const cb = { onEtapa: vi.fn() };

const resultadoOk: ResultadoCorrecao = {
  tentada: true,
  estrategias: ['CONVERTER_PDFA'],
  sucesso: true,
  tamanhoAntes: 10,
  tamanhoDepois: 8,
  textoPreservado: true,
  avisos: [],
  duracaoMs: 5,
  revalidacao: { apto: true, ocorrencias: [] },
};

/** Worker falso que emite `msgs` após receber `corrigir`. */
function fabricaComResposta(msgs: DaCorrecao[] | ((m: ParaCorrecao) => DaCorrecao[])): FabricaWorkerCorrecao & { criados: number; terminados: number } {
  const f = Object.assign(
    () => {
      f.criados++;
      const w = {
        onmessage: null as ((ev: MessageEvent<DaCorrecao>) => void) | null,
        onerror: null as ((ev: unknown) => void) | null,
        postMessage(m: ParaCorrecao) {
          const lista = typeof msgs === 'function' ? msgs(m) : msgs;
          queueMicrotask(() => {
            for (const x of lista) w.onmessage?.({ data: x } as MessageEvent<DaCorrecao>);
          });
        },
        terminate() {
          f.terminados++;
        },
      };
      return w as unknown as Worker;
    },
    { criados: 0, terminados: 0 },
  );
  return f;
}

test('PDF criptografado -> nao_corrigivel, sem criar worker', async () => {
  const fab = fabricaComResposta([]);
  const s = await corrigirArquivo({
    nomeArquivo: 'x.pdf',
    tipo: 'application/pdf',
    bytes: buf(),
    ocorrencias: [oc('ARQUIVO_CRIPTOGRAFADO')],
    cb,
    fabricaWorker: fab,
  });
  expect(s.estadoDestino).toBe('nao_corrigivel');
  expect(s.orientacao).toMatch(/protegido por senha/i);
  expect(fab.criados).toBe(0);
});

test('MP4 -> nao_corrigivel com orientação de mídia, sem worker', async () => {
  const fab = fabricaComResposta([]);
  const s = await corrigirArquivo({
    nomeArquivo: 'v.mp4',
    tipo: 'video/mp4',
    bytes: buf(),
    ocorrencias: [oc('TAMANHO_EXCEDIDO')],
    cb,
    fabricaWorker: fab,
  });
  expect(s.estadoDestino).toBe('nao_corrigivel');
  expect(s.orientacao).toMatch(/bitrate menor/i);
  expect(fab.criados).toBe(0);
});

test('sucesso -> corrigido, buffer não-nulo, worker terminado', async () => {
  const fab = fabricaComResposta([
    { tipo: 'etapa', mensagem: 'Convertendo para PDF/A…' },
    { tipo: 'resultado', resultado: resultadoOk, bufferCorrigido: new Uint8Array([9]).buffer },
  ]);
  const s = await corrigirArquivo({
    nomeArquivo: 'a.pdf',
    tipo: 'application/pdf',
    bytes: buf(),
    ocorrencias: [oc('ASSINATURA_PRESENTE')],
    cb,
    fabricaWorker: fab,
  });
  expect(s.estadoDestino).toBe('corrigido');
  expect(s.bufferCorrigido).not.toBeNull();
  expect(fab.terminados).toBeGreaterThanOrEqual(1);
});

test('revalidação reprovou -> correcao_falhou', async () => {
  const fab = fabricaComResposta([
    { tipo: 'resultado', resultado: { ...resultadoOk, sucesso: false, revalidacao: { apto: false, ocorrencias: [] } }, bufferCorrigido: null },
  ]);
  const s = await corrigirArquivo({
    nomeArquivo: 'a.pdf',
    tipo: 'application/pdf',
    bytes: buf(),
    ocorrencias: [oc('ASSINATURA_PRESENTE')],
    cb,
    fabricaWorker: fab,
  });
  expect(s.estadoDestino).toBe('correcao_falhou');
});

test('motor indisponível -> correcao_falhou com orientação para o manual', async () => {
  const fab = fabricaComResposta([{ tipo: 'motorIndisponivel' }]);
  const s = await corrigirArquivo({
    nomeArquivo: 'a.pdf',
    tipo: 'application/pdf',
    bytes: buf(),
    ocorrencias: [oc('ASSINATURA_PRESENTE')],
    cb,
    fabricaWorker: fab,
  });
  expect(s.estadoDestino).toBe('correcao_falhou');
  expect(s.orientacao).toMatch(/ainda não está disponível/i);
});

test('timeout -> aborta, correcao_falhou, worker terminado, sem lançar', async () => {
  const fab = fabricaComResposta([]); // nunca responde
  const s = await corrigirArquivo({
    nomeArquivo: 'a.pdf',
    tipo: 'application/pdf',
    bytes: buf(),
    ocorrencias: [oc('ASSINATURA_PRESENTE')],
    cb,
    fabricaWorker: fab,
    timeoutMs: 20,
  });
  expect(s.estadoDestino).toBe('correcao_falhou');
  expect(s.resultado?.avisos.join(' ')).toMatch(/tempo limite/i);
  expect(fab.terminados).toBeGreaterThanOrEqual(1);
});
