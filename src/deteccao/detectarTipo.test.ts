import { detectarTipo } from './detectarTipo';

const b = (...arr: number[]) => new Uint8Array(arr);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
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

test('PDF: %PDF- no início', () => {
  expect(detectarTipo(ascii('%PDF-1.7\n%\xE2\xE3\xCF\xD3'))).toBe('application/pdf');
});

test('PDF: %PDF- após BOM/prefixo curto', () => {
  expect(detectarTipo(concat(b(0xef, 0xbb, 0xbf), ascii('%PDF-1.4')))).toBe('application/pdf');
});

test('MP3: tag ID3', () => {
  expect(
    detectarTipo(concat(ascii('ID3'), b(0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21))),
  ).toBe('audio/mpeg');
});

test('MP3: frame sync 0xFFFB', () => {
  expect(detectarTipo(b(0xff, 0xfb, 0x90, 0x64, 0x00))).toBe('audio/mpeg');
});

test('MP4: ftyp com brand isom', () => {
  const buf = concat(
    b(0x00, 0x00, 0x00, 0x18),
    ascii('ftypisom'),
    b(0, 0, 0, 0),
    ascii('isommp41'),
  );
  expect(detectarTipo(buf)).toBe('video/mp4');
});

test('MP4: brand qt (MOV) não é aceito', () => {
  const buf = concat(b(0x00, 0x00, 0x00, 0x18), ascii('ftypqt  '), b(0, 0, 0, 0));
  expect(detectarTipo(buf)).toBeNull();
});

test('executável renomeado (MZ) -> null', () => {
  expect(detectarTipo(b(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
});

test('vazio -> null', () => {
  expect(detectarTipo(new Uint8Array())).toBeNull();
});
