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

test('MOV com brand qt é reconhecido como QuickTime, não como MP4', () => {
  const buf = concat(b(0x00, 0x00, 0x00, 0x18), ascii('ftypqt  '), b(0, 0, 0, 0));
  expect(detectarTipo(buf)).toBe('video/quicktime');
});

test('QuickTime antigo, sem ftyp, abrindo direto no moov', () => {
  expect(detectarTipo(concat(b(0x00, 0x00, 0x01, 0x00), ascii('moov'), b(0, 0, 0, 0)))).toBe(
    'video/quicktime',
  );
});

test('ftyp de outra família (3gp) não vira MP4', () => {
  const buf = concat(b(0x00, 0x00, 0x00, 0x14), ascii('ftyp3gp4'), b(0, 0, 0, 0), ascii('3gp4'));
  expect(detectarTipo(buf)).toBeNull();
});

// Regressão: a varredura antiga procurava um frame sync MPEG em 4 KB inteiros e
// casava por acaso em quase qualquer binário. Era assim que um MOV renomeado
// para .mp4 era classificado como MP3 e passava na validação inteira.
test('MP3: byte 0xFF no meio de um binário não conta como frame sync', () => {
  const lixo = new Uint8Array(512);
  lixo.set(ascii('\x00\x00\x00\x14ftypqt  '), 0);
  lixo[200] = 0xff;
  lixo[201] = 0xfb;
  lixo[202] = 0x90;
  lixo[203] = 0x64;
  expect(detectarTipo(lixo)).toBe('video/quicktime');
});

test('MP3: um header solto, sem segundo frame encadeado, não basta', () => {
  const so4Bytes = concat(b(0xff, 0xfb, 0x90, 0x64), new Uint8Array(2048));
  expect(detectarTipo(so4Bytes)).toBeNull();
});

test('MP3: dois frames encadeados são reconhecidos', () => {
  // 128 kbps, 44100 Hz, sem padding -> 417 bytes por frame.
  const frame = new Uint8Array(417);
  frame.set(b(0xff, 0xfb, 0x90, 0x64), 0);
  expect(detectarTipo(concat(frame, frame))).toBe('audio/mpeg');
});

test('executável renomeado (MZ) -> null', () => {
  expect(detectarTipo(b(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
});

test('vazio -> null', () => {
  expect(detectarTipo(new Uint8Array())).toBeNull();
});
