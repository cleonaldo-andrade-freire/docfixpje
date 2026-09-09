import { ehContainerQuickTime, codecMp4Suportado } from './quicktimeMp4';

const b = (...arr: number[]) => new Uint8Array(arr);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const u32 = (n: number) => b((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
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
/** stsd com uma única entrada de sample description do `formato` dado. */
function stsdCom(...formatos: string[]) {
  const entradas = formatos.map((f) => caixa(f)); // usa o próprio "caixa" como stub de sample entry
  return caixa('stsd', b(0, 0, 0, 0), u32(formatos.length), ...entradas);
}
function arvoreStbl(...folhas: Uint8Array[]) {
  return caixa('moov', caixa('trak', caixa('mdia', caixa('minf', caixa('stbl', ...folhas)))));
}

test('ehContainerQuickTime: true quando major brand é "qt"', () => {
  const buf = concat(caixa('ftyp', ascii('qt  '), b(0, 0, 0, 0)), caixa('moov'), caixa('mdat'));
  expect(ehContainerQuickTime(buf)).toBe(true);
});

test('ehContainerQuickTime: false para brand isom', () => {
  const buf = concat(caixa('ftyp', ascii('isom'), b(0, 0, 0, 0)), caixa('moov'), caixa('mdat'));
  expect(ehContainerQuickTime(buf)).toBe(false);
});

test('codecMp4Suportado: true quando só há avc1 (vídeo) e mp4a (áudio)', () => {
  const moov = arvoreStbl(stsdCom('avc1'), stsdCom('mp4a'));
  const buf = concat(caixa('ftyp', ascii('qt  '), b(0, 0, 0, 0)), moov, caixa('mdat'));
  expect(codecMp4Suportado(buf)).toBe(true);
});

test('codecMp4Suportado: false quando há um codec de vídeo não suportado (ex.: hvc1/HEVC)', () => {
  const moov = arvoreStbl(stsdCom('hvc1'), stsdCom('mp4a'));
  const buf = concat(caixa('ftyp', ascii('qt  '), b(0, 0, 0, 0)), moov, caixa('mdat'));
  expect(codecMp4Suportado(buf)).toBe(false);
});

test('codecMp4Suportado: false quando não há nenhum stsd (estrutura inesperada)', () => {
  const buf = concat(caixa('ftyp', ascii('qt  '), b(0, 0, 0, 0)), caixa('moov'), caixa('mdat'));
  expect(codecMp4Suportado(buf)).toBe(false);
});
