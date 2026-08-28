import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { BotaoValidar } from './BotaoValidar';
import { ControlesDescarte } from './ControlesDescarte';
import { AvisoPrivacidade } from './AvisoPrivacidade';
import { ENDERECO_OFICIAL } from '../config/limites';

test('BotaoValidar: lista vazia -> aria-disabled e rótulo explicativo associado', () => {
  render(<BotaoValidar habilitado={false} validando={false} onValidar={() => {}} />);
  const b = screen.getByRole('button', { name: /validar/i });
  expect(b).toHaveAttribute('aria-disabled', 'true');
  expect(b).toBeDisabled();
  const dica = screen.getByText(/adicione ao menos um arquivo/i);
  expect(b).toHaveAttribute('aria-describedby', dica.getAttribute('id'));
});

test('BotaoValidar: habilitado -> clique chama onValidar', async () => {
  const onValidar = vi.fn();
  render(<BotaoValidar habilitado validando={false} onValidar={onValidar} />);
  await userEvent.click(screen.getByRole('button', { name: /validar/i }));
  expect(onValidar).toHaveBeenCalled();
});

test('BotaoValidar: validando -> rótulo "Validando…" e desabilitado', () => {
  render(<BotaoValidar habilitado validando onValidar={() => {}} />);
  expect(screen.getByRole('button', { name: /validando/i })).toBeDisabled();
});

test('ControlesDescarte: com itens mostra "Limpar tudo" e dispara callback', async () => {
  const onLimpar = vi.fn();
  render(<ControlesDescarte temItens ocioso={false} onLimparTudo={onLimpar} />);
  await userEvent.click(screen.getByRole('button', { name: /limpar tudo/i }));
  expect(onLimpar).toHaveBeenCalled();
});

test('ControlesDescarte: sem itens não mostra o botão', () => {
  render(<ControlesDescarte temItens={false} ocioso={false} onLimparTudo={() => {}} />);
  expect(screen.queryByRole('button', { name: /limpar tudo/i })).not.toBeInTheDocument();
});

test('ControlesDescarte: ocioso mostra o banner com o texto exato', () => {
  render(<ControlesDescarte temItens={false} ocioso onLimparTudo={() => {}} />);
  expect(screen.getByText('Os arquivos foram descartados por inatividade.')).toBeInTheDocument();
});

test('AvisoPrivacidade: frase de privacidade + endereço oficial, sem "apagamento seguro"', () => {
  render(<AvisoPrivacidade />);
  expect(screen.getByText(/só na memória deste navegador/i)).toBeInTheDocument();
  expect(screen.getByText(ENDERECO_OFICIAL)).toBeInTheDocument();
  expect(screen.queryByText(/apagamento seguro|apaga com segurança/i)).not.toBeInTheDocument();
});
