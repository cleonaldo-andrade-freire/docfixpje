import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Diagnostico } from './Diagnostico';
import type { Ocorrencia, ResultadoValidacao } from '../tipos';

const res = (ocorrencias: Ocorrencia[], over: Partial<ResultadoValidacao> = {}): ResultadoValidacao => ({
  nomeArquivo: 'x.pdf',
  tipoDetectado: 'application/pdf',
  tamanhoBytes: 1,
  pdfaParte: null,
  pdfaConformidade: null,
  apto: !ocorrencias.some((o) => o.gravidade === 'erro'),
  corrigivel: ocorrencias.some((o) => o.correcaoDisponivel !== null),
  ocorrencias,
  ...over,
});

const oc = (codigo: Ocorrencia['codigo'], over: Partial<Ocorrencia> = {}): Ocorrencia => ({
  codigo,
  gravidade: 'erro',
  mensagem: `msg ${codigo}`,
  detalheTecnico: `tec ${codigo}`,
  orientacao: `ori ${codigo}`,
  correcaoDisponivel: 'REMOVER_ASSINATURA',
  ...over,
});

test('apto sem ocorrências -> não renderiza nada', () => {
  const { container } = render(<Diagnostico resultado={res([])} />);
  expect(container).toBeEmptyDOMElement();
});

test('assinatura + PDF/A -> UMA lista ordenada de 2 passos (§7.4)', () => {
  const r = res([oc('ASSINATURA_PRESENTE'), oc('PDFA_NAO_DECLARADO', { correcaoDisponivel: 'CONVERTER_PDFA' })]);
  render(<Diagnostico resultado={r} />);
  const listas = screen.getAllByRole('list');
  expect(listas).toHaveLength(1);
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
});

test('mostra badge, mensagem, orientação e detalhe técnico', () => {
  render(<Diagnostico resultado={res([oc('ASSINATURA_PRESENTE')])} />);
  expect(screen.getByText('Erro')).toBeInTheDocument();
  expect(screen.getByText('msg ASSINATURA_PRESENTE')).toBeInTheDocument();
  expect(screen.getByText('ori ASSINATURA_PRESENTE')).toBeInTheDocument();
  expect(screen.getByText('Detalhe técnico')).toBeInTheDocument();
});

test('Diagnostico em si não renderiza botão de correção (fica na LinhaArquivo)', () => {
  render(<Diagnostico resultado={res([oc('ASSINATURA_PRESENTE')])} estado="inapto" />);
  expect(screen.queryByRole('button', { name: /corrigir/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/próxima versão/i)).not.toBeInTheDocument();
});

test('mostra os avisos da correção (ex.: rasterização / resolução)', () => {
  render(
    <Diagnostico
      resultado={res([oc('ASSINATURA_PRESENTE', { correcaoDisponivel: 'REMOVER_ASSINATURA' })])}
      estado="corrigido"
      resultadoCorrecao={{
        tentada: true,
        estrategias: ['REMOVER_ASSINATURA'],
        sucesso: true,
        tamanhoAntes: 100,
        tamanhoDepois: 80,
        textoPreservado: false,
        avisos: ['Para remover a assinatura, as páginas foram convertidas em imagem.'],
        duracaoMs: 1200,
        revalidacao: { apto: true, ocorrencias: [] },
      }}
    />,
  );
  expect(screen.getByText(/convertidas em imagem/i)).toBeInTheDocument();
});

test('linha aprovada (apto): não renderiza painel nenhum', () => {
  const { container } = render(
    <Diagnostico resultado={res([oc('PDFA_NAO_DECLARADO', { correcaoDisponivel: null })])} estado="apto" />,
  );
  expect(container).toBeEmptyDOMElement();
});

test('avisos de validação nunca são exibidos', () => {
  const aviso: Parameters<typeof res>[0][number] = {
    codigo: 'PDFA_NAO_DECLARADO',
    gravidade: 'aviso',
    mensagem: 'nao deveria aparecer',
    detalheTecnico: 't',
    orientacao: 'o',
    correcaoDisponivel: 'CONVERTER_PDFA',
  };
  const { container } = render(<Diagnostico resultado={res([aviso])} estado="inapto" />);
  expect(container).toBeEmptyDOMElement();
});

test('arquivo criptografado: orientação de remover proteção, sem nota de correção', () => {
  const r = res([
    oc('ARQUIVO_CRIPTOGRAFADO', { correcaoDisponivel: null, orientacao: 'Remova a proteção por senha na origem.' }),
  ]);
  render(<Diagnostico resultado={r} />);
  expect(screen.getByText(/remova a proteção por senha/i)).toBeInTheDocument();
  expect(screen.queryByText(/próxima versão/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
