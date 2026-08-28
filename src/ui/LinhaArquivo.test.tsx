import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { LinhaArquivo } from './LinhaArquivo';
import { formatarTamanho, tipoLegivel } from '../infra/formato';
import type { ItemArquivo } from '../estado/store';

const item = (over: Partial<ItemArquivo> = {}): ItemArquivo => ({
  id: 'a',
  file: new File([new Uint8Array(1024)], 'ctps-digital.pdf'),
  tipoRapido: 'application/pdf',
  estado: 'aguardando',
  etapa: null,
  resultado: null,
  correcao: null,
  ...over,
});

test('formatarTamanho em pt-BR', () => {
  expect(formatarTamanho(10_485_760)).toBe('10,00 MB');
  expect(formatarTamanho(1024)).toBe('1,00 KB');
  expect(formatarTamanho(512)).toBe('512 B');
  expect(formatarTamanho(9_999_999)).toBe('9,54 MB');
});

test('tipoLegivel', () => {
  expect(tipoLegivel('application/pdf')).toBe('PDF');
  expect(tipoLegivel('audio/mpeg')).toBe('MP3');
  expect(tipoLegivel(null)).toBe('desconhecido');
});

test('linha aguardando mostra nome, tipo, tamanho e estado', () => {
  render(<LinhaArquivo item={item()} onRemover={() => {}} />);
  expect(screen.getByText('ctps-digital.pdf')).toBeInTheDocument();
  expect(screen.getByText('PDF')).toBeInTheDocument();
  expect(screen.getByText('1,00 KB')).toBeInTheDocument();
  expect(screen.getByText('Aguardando validação')).toBeInTheDocument();
});

test('clicar no ✕ chama onRemover com o id', async () => {
  const onRemover = vi.fn();
  render(<LinhaArquivo item={item()} onRemover={onRemover} />);
  await userEvent.click(screen.getByRole('button', { name: /remover ctps-digital\.pdf/i }));
  expect(onRemover).toHaveBeenCalledWith('a');
});

test('linha em validação não mostra o botão remover', () => {
  render(<LinhaArquivo item={item({ estado: 'validando', etapa: 'Lendo o arquivo…' })} onRemover={() => {}} />);
  expect(screen.queryByRole('button', { name: /remover/i })).not.toBeInTheDocument();
});

test('linha inapta mostra o resumo do erro', () => {
  render(
    <LinhaArquivo
      item={item({
        estado: 'inapto',
        resultado: {
          nomeArquivo: 'x',
          tipoDetectado: 'application/pdf',
          tamanhoBytes: 1,
          pdfaParte: null,
          pdfaConformidade: null,
          apto: false,
          corrigivel: true,
          ocorrencias: [
            {
              codigo: 'ASSINATURA_PRESENTE',
              gravidade: 'erro',
              mensagem: 'O documento contém 1 assinatura digital.',
              detalheTecnico: '',
              orientacao: '',
              correcaoDisponivel: 'REMOVER_ASSINATURA',
            },
          ],
        },
      })}
      onRemover={() => {}}
    />,
  );
  // aparece no rótulo de estado e no diagnóstico embutido
  expect(
    screen.getAllByText('O documento contém 1 assinatura digital.').length,
  ).toBeGreaterThanOrEqual(1);
});
