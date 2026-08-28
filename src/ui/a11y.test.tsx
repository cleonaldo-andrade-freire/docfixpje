import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { axe } from 'jest-axe';
import { App } from '../App';
import { processarValidacao } from '../workers/validacao.worker';
import type { FabricaWorker } from '../execucao/orquestrador';
import { lerFixture } from '../../scripts/lib/ler-fixture';

const fabricaWorker: FabricaWorker = () => {
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

test('tela vazia: sem violações de acessibilidade', async () => {
  const { container } = render(<App fabricaWorker={fabricaWorker} />);
  expect(await axe(container)).toHaveNoViolations();
});

test('tela com lista aguardando: sem violações', async () => {
  const { container } = render(<App fabricaWorker={fabricaWorker} />);
  await userEvent.upload(screen.getByLabelText(/selecionar arquivos/i), [
    new File([lerFixture('simples.pdf')], 'simples.pdf'),
  ]);
  expect(await axe(container)).toHaveNoViolations();
});

test('tela pós-validação (1 apto + 1 inapto): sem violações', async () => {
  const { container } = render(<App fabricaWorker={fabricaWorker} />);
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText(/selecionar arquivos/i), [
    new File([lerFixture('simples.pdf')], 'simples.pdf'),
    new File([lerFixture('assinado.pdf')], 'assinado.pdf'),
  ]);
  await user.click(screen.getByRole('button', { name: /^validar$/i }));
  await screen.findByText('Pronto para anexar ao PJe');
  expect(await axe(container)).toHaveNoViolations();
});

test('ordem de tabulação: input de upload vem antes do botão Validar', async () => {
  render(<App fabricaWorker={fabricaWorker} />);
  const user = userEvent.setup();
  await user.tab();
  expect(screen.getByLabelText(/selecionar arquivos/i)).toHaveFocus();
});
