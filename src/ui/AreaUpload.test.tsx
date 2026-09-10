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

// mp4 sintético em contêiner QuickTime (vídeo de iPhone/WhatsApp), avc1+mp4a.
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
function stsdCom(...formatos: string[]) {
  return caixa('stsd', u32(0), u32(formatos.length), ...formatos.map((f) => caixa(f)));
}
function arquivoMp4QuickTime(nome: string): File {
  const ftyp = caixa('ftyp', ascii('qt  '), u32(0));
  const stbl = caixa('stbl', stsdCom('avc1'), stsdCom('mp4a'));
  const moov = caixa('moov', caixa('trak', caixa('mdia', caixa('minf', stbl))));
  const mdat = caixa('mdat', new Uint8Array([1, 2, 3]));
  return new File([concat(ftyp, moov, mdat)], nome, { type: 'video/mp4' });
}

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

test('mp4 QuickTime (iPhone/WhatsApp) -> tipoRapido video/quicktime, não audio/mpeg nem null', async () => {
  // O selo diz "MOV": é a primeira pista visível de que a extensão .mp4 está
  // mentindo. Antes isto caía no falso positivo de MP3 e virava audio/mpeg.
  const onArquivos = vi.fn();
  render(<AreaUpload totalAtual={0} onArquivos={onArquivos} onRecusa={() => {}} />);
  const input = screen.getByLabelText(/selecionar arquivos/i);
  await userEvent.upload(input, arquivoMp4QuickTime('video.mp4'));
  const item = onArquivos.mock.calls[0]![0][0];
  expect(item.tipoRapido).toBe('video/quicktime');
});

test('mp4 QuickTime com moov maior que a janela de preview -> tipoRapido ainda assim video/quicktime', async () => {
  // Caso real: o moov de um vídeo de iPhone facilmente passa dos ~4 KB que o
  // preview lê antes de "Validar" — o selo não pode depender de enxergar o
  // moov inteiro (isso só acontece na validação completa, com o arquivo todo).
  const onArquivos = vi.fn();
  const ftyp = caixa('ftyp', ascii('qt  '), u32(0));
  const recheio = caixa('free', new Uint8Array(6000)); // empurra o stsd para além da janela
  const stbl = caixa('stbl', stsdCom('avc1'), stsdCom('mp4a'));
  const moov = caixa('moov', recheio, caixa('trak', caixa('mdia', caixa('minf', stbl))));
  const mdat = caixa('mdat', new Uint8Array([1, 2, 3]));
  const arquivo = new File([concat(ftyp, moov, mdat)], 'video-grande.mp4', { type: 'video/mp4' });

  render(<AreaUpload totalAtual={0} onArquivos={onArquivos} onRecusa={() => {}} />);
  const input = screen.getByLabelText(/selecionar arquivos/i);
  await userEvent.upload(input, arquivo);
  const item = onArquivos.mock.calls[0]![0][0];
  expect(item.tipoRapido).toBe('video/quicktime');
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
