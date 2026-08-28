import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ListaArquivos } from './ListaArquivos';
import type { ItemArquivo } from '../estado/store';

const item = (id: string, over: Partial<ItemArquivo> = {}): ItemArquivo => ({
  id,
  file: new File([new Uint8Array(10)], `${id}.pdf`),
  tipoRapido: 'application/pdf',
  estado: 'aguardando',
  etapa: null,
  resultado: null,
  resultadoCorrecao: null,
  orientacaoCorrecao: null,
  correcao: null,
  ...over,
});

test('lista vazia -> não renderiza nada', () => {
  const { container } = render(<ListaArquivos itens={[]} onRemover={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

test('renderiza uma linha por item', () => {
  render(<ListaArquivos itens={[item('a'), item('b'), item('c')]} onRemover={() => {}} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
});

test('linha com resultado inapto embute o diagnóstico', () => {
  render(
    <ListaArquivos
      itens={[
        item('a', {
          estado: 'inapto',
          resultado: {
            nomeArquivo: 'a.pdf',
            tipoDetectado: 'application/pdf',
            tamanhoBytes: 10,
            pdfaParte: null,
            pdfaConformidade: null,
            apto: false,
            corrigivel: true,
            ocorrencias: [
              {
                codigo: 'ASSINATURA_PRESENTE',
                gravidade: 'erro',
                mensagem: 'O documento contém 1 assinatura digital.',
                detalheTecnico: 'SigFlags=3',
                orientacao: 'A correção automática remove a assinatura.',
                correcaoDisponivel: 'REMOVER_ASSINATURA',
              },
            ],
          },
        }),
      ]}
      onRemover={() => {}}
      onCorrigir={() => {}}
      onBaixarOriginal={() => {}}
    />,
  );
  expect(screen.getByText('Detalhe técnico')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /tentar corrigir/i })).toBeInTheDocument();
});
