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

// Construtores de mp4 sintético para exercitar o remux QuickTime->ISO fim a fim.
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const u32 = (n: number) =>
  new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
function concat(...parts: Uint8Array[]) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function caixa(tipo: string, ...conteudo: Uint8Array[]) {
  const corpo = concat(...conteudo);
  return concat(u32(8 + corpo.length), ascii(tipo), corpo);
}
function mp4QuickTimeValido(): ArrayBuffer {
  const ftyp = caixa('ftyp', ascii('qt  '), u32(0));
  const stco = caixa('stco', u32(0), u32(0)); // version/flags=0, entry_count=0
  const moov = caixa('moov', caixa('trak', caixa('mdia', caixa('minf', caixa('stbl', stco)))));
  const mdat = caixa('mdat', new Uint8Array([1, 2, 3]));
  return concat(ftyp, moov, mdat).buffer;
}

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

test('PDF que exige senha (ARQUIVO_CRIPTOGRAFADO) -> nao_corrigivel, sem criar worker', async () => {
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

test('PDF com restrições (PDFA_CRIPTOGRAFADO, abre sem senha) -> vai para o worker', async () => {
  const fab = fabricaComResposta([
    { tipo: 'resultado', resultado: resultadoOk, bufferCorrigido: new Uint8Array([9]).buffer },
  ]);
  const s = await corrigirArquivo({
    nomeArquivo: 'ctps.pdf',
    tipo: 'application/pdf',
    bytes: buf(),
    ocorrencias: [oc('ASSINATURA_PRESENTE'), oc('PDFA_CRIPTOGRAFADO')],
    cb,
    fabricaWorker: fab,
  });
  expect(s.estadoDestino).toBe('corrigido');
  expect(fab.criados).toBe(1);
});

test('MP4_CONTAINER_QUICKTIME -> remuxa, revalida e retorna corrigido, sem worker', async () => {
  const fab = fabricaComResposta([]);
  const s = await corrigirArquivo({
    nomeArquivo: 'v.mp4',
    tipo: 'video/mp4',
    bytes: mp4QuickTimeValido(),
    ocorrencias: [oc('MP4_CONTAINER_QUICKTIME')],
    cb,
    fabricaWorker: fab,
  });
  expect(s.estadoDestino).toBe('corrigido');
  expect(s.bufferCorrigido).not.toBeNull();
  expect(s.resultado?.estrategias).toEqual(['REMUXAR_MP4']);
  expect(s.resultado?.revalidacao.apto).toBe(true);
  expect(fab.criados).toBe(0);
});

test('MP4_CONTAINER_QUICKTIME com estrutura inesperada (sem moov) -> correcao_falhou, sem worker', async () => {
  const fab = fabricaComResposta([]);
  const semMoov = concat(caixa('ftyp', ascii('qt  '), u32(0)), caixa('mdat', new Uint8Array([1]))).buffer;
  const s = await corrigirArquivo({
    nomeArquivo: 'v.mp4',
    tipo: 'video/mp4',
    bytes: semMoov,
    ocorrencias: [oc('MP4_CONTAINER_QUICKTIME')],
    cb,
    fabricaWorker: fab,
  });
  expect(s.estadoDestino).toBe('correcao_falhou');
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
