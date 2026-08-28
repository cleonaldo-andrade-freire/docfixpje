import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { App } from './App';
import { processarValidacao } from './workers/validacao.worker';
import type { FabricaWorker } from './execucao/orquestrador';
import { lerFixture } from '../scripts/lib/ler-fixture';

/** Worker falso que roda o handler real de validação (integração da cadeia). */
const fabricaWorker: FabricaWorker = () => {
  const w = {
    onmessage: null as ((ev: MessageEvent) => void) | null,
    onerror: null as ((ev: unknown) => void) | null,
    postMessage(msg: unknown) {
      void processarValidacao(msg as never, (m) =>
        this.onmessage?.({ data: m } as MessageEvent),
      );
    },
    terminate() {},
  };
  return w as unknown as Worker;
};

const fixtureFile = (nome: string) => new File([lerFixture(nome)], nome);

test('upload → Validar → um apto verde e um inapto vermelho com orientação', async () => {
  const user = userEvent.setup();
  render(<App fabricaWorker={fabricaWorker} />);

  await user.upload(screen.getByLabelText(/selecionar arquivos/i), [
    fixtureFile('simples.pdf'),
    fixtureFile('assinado.pdf'),
  ]);

  const linhaSimples = () => screen.getByRole('listitem', { name: 'simples.pdf' });
  const linhaAssinado = () => screen.getByRole('listitem', { name: 'assinado.pdf' });
  expect(within(linhaSimples()).getByText('Aguardando validação')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /^validar$/i }));

  expect(await within(linhaSimples()).findByText('Pronto para anexar ao PJe')).toBeInTheDocument();
  expect(within(linhaSimples()).getByRole('img', { name: /aprovado/i })).toBeInTheDocument();

  expect(
    (await within(linhaAssinado()).findAllByText(/contém 1 assinatura digital/i)).length,
  ).toBeGreaterThanOrEqual(1);
  expect(within(linhaAssinado()).getAllByRole('img', { name: /não apto/i }).length).toBeGreaterThanOrEqual(1);
  // linha reprovada e corrigível: oferece "Tentar corrigir", não o passo a passo manual
  expect(within(linhaAssinado()).getByRole('button', { name: /tentar corrigir/i })).toBeInTheDocument();
  expect(within(linhaAssinado()).queryByText(/reimprima o pdf pelo navegador/i)).not.toBeInTheDocument();
});

test('após validar tudo, o botão Validar volta a ficar desabilitado', async () => {
  const user = userEvent.setup();
  render(<App fabricaWorker={fabricaWorker} />);
  await user.upload(screen.getByLabelText(/selecionar arquivos/i), [fixtureFile('simples.pdf')]);
  await user.click(screen.getByRole('button', { name: /^validar$/i }));
  await screen.findByText('Pronto para anexar ao PJe');
  expect(screen.getByRole('button', { name: /^validar$/i })).toBeDisabled();
});

test('Limpar tudo esvazia a lista e desabilita Validar', async () => {
  const user = userEvent.setup();
  render(<App fabricaWorker={fabricaWorker} />);
  await user.upload(screen.getByLabelText(/selecionar arquivos/i), [fixtureFile('simples.pdf')]);
  expect(screen.getAllByRole('listitem')).toHaveLength(1);

  await user.click(screen.getByRole('button', { name: /limpar tudo/i }));
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  expect(screen.getByRole('button', { name: /^validar$/i })).toHaveAttribute('aria-disabled', 'true');
});
