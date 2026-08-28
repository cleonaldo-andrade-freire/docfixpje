import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { axe } from 'jest-axe';
import { EstadoLinha } from './EstadoLinha';
import type { EstadoLinha as Estado } from '../estado/maquinaLinha';

test('apto: círculo com check + rótulo textual da spec §6', () => {
  render(<EstadoLinha estado="apto" />);
  expect(screen.getByRole('img', { name: /aprovado/i })).toBeInTheDocument();
  expect(screen.getByText('Pronto para anexar ao PJe')).toBeInTheDocument();
});

test('inapto: triângulo com exclamação + resumo dos motivos', () => {
  render(<EstadoLinha estado="inapto" resumo="1 assinatura digital" />);
  expect(screen.getByRole('img', { name: /não apto/i })).toBeInTheDocument();
  expect(screen.getByText('1 assinatura digital')).toBeInTheDocument();
});

test('validando: mostra a mensagem da etapa corrente', () => {
  render(<EstadoLinha estado="validando" etapa="Procurando assinatura digital…" />);
  expect(screen.getByText('Procurando assinatura digital…')).toBeInTheDocument();
});

test('região é status com aria-live="polite" (nunca assertive)', () => {
  render(<EstadoLinha estado="validando" etapa="Lendo o arquivo…" />);
  const status = screen.getByRole('status');
  expect(status).toHaveAttribute('aria-live', 'polite');
});

test('todos os 8 estados renderizam ícone + texto e passam no axe', async () => {
  const estados: Estado[] = [
    'aguardando',
    'validando',
    'apto',
    'inapto',
    'corrigindo',
    'corrigido',
    'correcao_falhou',
    'nao_corrigivel',
  ];
  for (const e of estados) {
    const { container, unmount } = render(<EstadoLinha estado={e} resumo="motivo" etapa="etapa" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
    unmount();
  }
});
