import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { AreaUpload } from './AreaUpload';
import { LIMITES } from '../config/limites';

const pdfBytes = () => {
  const b = new Uint8Array(64);
  b.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37], 0); // %PDF-1.7
  return b;
};
const arquivoPdf = (nome: string) => new File([pdfBytes()], nome, { type: 'application/pdf' });

test('selecionar 2 arquivos chama onArquivos com tipoRapido detectado', async () => {
  const onArquivos = vi.fn();
  render(<AreaUpload totalAtual={0} onArquivos={onArquivos} onRecusa={() => {}} />);
  const input = screen.getByLabelText(/selecionar arquivos/i);
  await userEvent.upload(input, [arquivoPdf('a.pdf'), arquivoPdf('b.pdf')]);
  expect(onArquivos).toHaveBeenCalledTimes(1);
  const itens = onArquivos.mock.calls[0]![0];
  expect(itens).toHaveLength(2);
  expect(itens[0].tipoRapido).toBe('application/pdf');
  expect(itens[0].estado).toBe('aguardando');
});

test('lote acima do máximo -> onRecusa, sem onArquivos', async () => {
  const onArquivos = vi.fn();
  const onRecusa = vi.fn();
  render(
    <AreaUpload totalAtual={LIMITES.MAX_ARQUIVOS_LOTE - 1} onArquivos={onArquivos} onRecusa={onRecusa} />,
  );
  await userEvent.upload(screen.getByLabelText(/selecionar arquivos/i), [
    arquivoPdf('a.pdf'),
    arquivoPdf('b.pdf'),
  ]);
  expect(onRecusa).toHaveBeenCalledTimes(1);
  expect(onArquivos).not.toHaveBeenCalled();
});

test('arquivo gigante entra reprovado sem ler os bytes', async () => {
  const onArquivos = vi.fn();
  const grande = arquivoPdf('grande.pdf');
  Object.defineProperty(grande, 'size', { value: LIMITES.TAMANHO_ABSOLUTO_LEITURA_BYTES + 1 });
  const espiaoSlice = vi.spyOn(grande, 'slice');

  render(<AreaUpload totalAtual={0} onArquivos={onArquivos} onRecusa={() => {}} />);
  await userEvent.upload(screen.getByLabelText(/selecionar arquivos/i), grande);

  const item = onArquivos.mock.calls[0]![0][0];
  expect(item.estado).toBe('inapto');
  expect(item.resultado.ocorrencias[0].codigo).toBe('TAMANHO_EXCEDIDO');
  expect(espiaoSlice).not.toHaveBeenCalled();
});

test('o input é focável por teclado', async () => {
  render(<AreaUpload totalAtual={0} onArquivos={() => {}} onRecusa={() => {}} />);
  await userEvent.tab();
  expect(screen.getByLabelText(/selecionar arquivos/i)).toHaveFocus();
});
