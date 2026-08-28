import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from './App';
import { processarValidacao } from './workers/validacao.worker';
import type { FabricaWorker } from './execucao/orquestrador';
import type { FabricaWorkerCorrecao } from './correcao/corrigirArquivo';
import type { DaCorrecao, ParaCorrecao } from './correcao/protocoloCorrecao';
import type { ResultadoCorrecao } from './tipos';
import { lerFixture } from '../scripts/lib/ler-fixture';

const fabricaValidacao: FabricaWorker = () => {
  const w = {
    onmessage: null as ((ev: MessageEvent) => void) | null,
    onerror: null as ((ev: unknown) => void) | null,
    postMessage(msg: unknown) {
      void processarValidacao(msg as never, (m) => this.onmessage?.({ data: m } as MessageEvent));
    },
    terminate() {},
  };
  return w as unknown as Worker;
};

const RES_OK: ResultadoCorrecao = {
  tentada: true,
  estrategias: ['REMOVER_ASSINATURA', 'CONVERTER_PDFA'],
  sucesso: true,
  tamanhoAntes: 3888,
  tamanhoDepois: 3000,
  textoPreservado: true,
  avisos: [],
  duracaoMs: 40,
  revalidacao: { apto: true, ocorrencias: [] },
};

function fabricaCorrecao(
  msgs: DaCorrecao[] | ((m: ParaCorrecao) => DaCorrecao[]),
): FabricaWorkerCorrecao {
  return () => {
    const w = {
      onmessage: null as ((ev: MessageEvent<DaCorrecao>) => void) | null,
      onerror: null as ((ev: unknown) => void) | null,
      postMessage(m: ParaCorrecao) {
        const lista = typeof msgs === 'function' ? msgs(m) : msgs;
        queueMicrotask(() => {
          for (const x of lista) w.onmessage?.({ data: x } as MessageEvent<DaCorrecao>);
        });
      },
      terminate() {},
    };
    return w as unknown as Worker;
  };
}

const fixtureFile = (n: string) => new File([lerFixture(n)], n);

beforeEach(() => {
  let n = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => `blob:teste/${++n}`),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

async function ateInapto(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(screen.getByLabelText(/selecionar arquivos/i), [fixtureFile('assinado.pdf')]);
  await user.click(screen.getByRole('button', { name: /^validar$/i }));
  await screen.findByRole('button', { name: /tentar corrigir/i });
}

test('inapto → Tentar corrigir → corrigindo → corrigido, com downloads', async () => {
  const user = userEvent.setup();
  render(
    <App
      fabricaWorker={fabricaValidacao}
      fabricaWorkerCorrecao={fabricaCorrecao([
        { tipo: 'etapa', mensagem: 'Removendo a assinatura…' },
        { tipo: 'resultado', resultado: RES_OK, bufferCorrigido: new Uint8Array([1, 2]).buffer },
      ])}
    />,
  );
  await ateInapto(user);

  await user.click(screen.getByRole('button', { name: /tentar corrigir/i }));

  const linha = await screen.findByRole('listitem', { name: 'assinado.pdf' });
  expect(await within(linha).findByText('Corrigido — revalidado com sucesso')).toBeInTheDocument();
  expect(within(linha).getByRole('link', { name: /baixar arquivo corrigido/i })).toHaveAttribute(
    'download',
    'assinado-corrigido.pdf',
  );
  expect(within(linha).getByRole('button', { name: /baixar original/i })).toBeInTheDocument();
});

test('aviso legal aparece na 1ª correção e não some depois', async () => {
  const user = userEvent.setup();
  render(
    <App
      fabricaWorker={fabricaValidacao}
      fabricaWorkerCorrecao={fabricaCorrecao([
        { tipo: 'resultado', resultado: RES_OK, bufferCorrigido: new Uint8Array([1]).buffer },
      ])}
    />,
  );
  await ateInapto(user);
  expect(screen.queryByText(/documento novo/i)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /tentar corrigir/i }));
  expect(await screen.findByText(/documento novo/i)).toBeInTheDocument();
});

test('correção falha → correcao_falhou vermelho + orientação manual', async () => {
  const user = userEvent.setup();
  render(
    <App
      fabricaWorker={fabricaValidacao}
      fabricaWorkerCorrecao={fabricaCorrecao([
        {
          tipo: 'resultado',
          resultado: { ...RES_OK, sucesso: false, revalidacao: { apto: false, ocorrencias: [] } },
          bufferCorrigido: null,
        },
      ])}
    />,
  );
  await ateInapto(user);
  await user.click(screen.getByRole('button', { name: /tentar corrigir/i }));

  const linha = await screen.findByRole('listitem', { name: 'assinado.pdf' });
  expect(
    await within(linha).findByText('Não foi possível corrigir automaticamente'),
  ).toBeInTheDocument();
  expect(within(linha).getByText(/remova a assinatura reimprimindo|reimprima o pdf/i)).toBeInTheDocument();
});

test('motor indisponível → correcao_falhou com nota de correção manual', async () => {
  const user = userEvent.setup();
  render(
    <App
      fabricaWorker={fabricaValidacao}
      fabricaWorkerCorrecao={fabricaCorrecao([{ tipo: 'motorIndisponivel' }])}
    />,
  );
  await ateInapto(user);
  await user.click(screen.getByRole('button', { name: /tentar corrigir/i }));
  expect(await screen.findByText(/ainda não está disponível/i)).toBeInTheDocument();
});
