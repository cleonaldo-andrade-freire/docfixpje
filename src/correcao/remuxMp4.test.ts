import { remuxarQuickTimeParaIsom } from './remuxMp4';
import { detectarTipo } from '../deteccao/detectarTipo';

const b = (...arr: number[]) => new Uint8Array(arr);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const u32 = (n: number) => b((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
function u64(n: number) {
  const hi = Math.floor(n / 2 ** 32);
  const lo = n >>> 0;
  return concat(u32(hi), u32(lo));
}
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
/** Aninha uma caixa dentro de outra: moov > trak > mdia > minf > stbl > (folha). */
function arvoreStbl(folha: Uint8Array) {
  return caixa('moov', caixa('trak', caixa('mdia', caixa('minf', caixa('stbl', folha)))));
}

const ftypQt = () => caixa('ftyp', ascii('qt  '), b(0, 0, 0, 0));
const ftypIsom = () => caixa('ftyp', ascii('isom'), b(0, 0, 0, 0));

test('remuxa ftyp qt->isom e ajusta os offsets do stco pelo delta de tamanho', () => {
  const stco = caixa('stco', b(0, 0, 0, 0), u32(2), u32(1000), u32(2000));
  const original = concat(ftypQt(), arvoreStbl(stco), caixa('mdat', b(0xab, 0xab, 0xab)));

  const r = remuxarQuickTimeParaIsom(original);

  expect(r.ok).toBe(true);
  const saida = r.bytes!;
  expect(detectarTipo(saida)).toBe('video/mp4');

  const delta = saida.length - original.length;
  expect(delta).toBeGreaterThan(0);

  // Os últimos 3 bytes (mdat) devem estar intactos, só que deslocados pelo delta.
  expect(saida.subarray(saida.length - 3)).toEqual(b(0xab, 0xab, 0xab));

  // stco: procura os dois inteiros de 32 bits que devem ter virado 1000+delta e 2000+delta.
  const dv = new DataView(saida.buffer, saida.byteOffset, saida.byteLength);
  const stcoOffset = saida.length - 3 - 8 - 8; // mdat(8) + entries(8) antes do mdat
  expect(dv.getUint32(stcoOffset)).toBe(1000 + delta);
  expect(dv.getUint32(stcoOffset + 4)).toBe(2000 + delta);
});

test('ajusta também co64 (offsets de 64 bits)', () => {
  const co64 = caixa('co64', b(0, 0, 0, 0), u32(1), u64(5_000_000));
  const original = concat(ftypQt(), arvoreStbl(co64), caixa('mdat', b(1, 2)));

  const r = remuxarQuickTimeParaIsom(original);
  expect(r.ok).toBe(true);
  const saida = r.bytes!;
  const delta = saida.length - original.length;

  const dv = new DataView(saida.buffer, saida.byteOffset, saida.byteLength);
  const co64Offset = saida.length - 2 - 8 - 8; // mdat(2) + entry(8) antes do mdat
  const alto = dv.getUint32(co64Offset);
  const baixo = dv.getUint32(co64Offset + 4);
  expect(alto * 2 ** 32 + baixo).toBe(5_000_000 + delta);
});

test('não mexe em arquivo que já não é QuickTime', () => {
  const original = concat(ftypIsom(), caixa('moov'), caixa('mdat', b(1)));
  const r = remuxarQuickTimeParaIsom(original);
  expect(r.ok).toBe(false);
  expect(r.motivo).toMatch(/quicktime/i);
});

test('falha de forma controlada quando não encontra moov', () => {
  const original = concat(ftypQt(), caixa('mdat', b(1)));
  const r = remuxarQuickTimeParaIsom(original);
  expect(r.ok).toBe(false);
  expect(r.motivo).toMatch(/moov/i);
});
