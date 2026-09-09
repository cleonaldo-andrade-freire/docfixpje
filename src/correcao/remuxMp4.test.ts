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

// Achado real (2026-09-09): o PJe recusa o vídeo mesmo já em contêiner isom com
// stco corrigido — só um remux que também descarta essas caixas específicas do
// QuickTime (comprovado com `ffmpeg -c copy`, testado de verdade no PJe) funciona.

test('remove a caixa tapt de dentro de trak', () => {
  const stbl = caixa('stbl', caixa('stco', b(0, 0, 0, 0), u32(0)));
  const trak = caixa('trak', caixa('tapt', b(1, 2, 3)), caixa('mdia', caixa('minf', stbl)));
  const original = concat(ftypQt(), caixa('moov', trak), caixa('mdat', b(9)));

  const r = remuxarQuickTimeParaIsom(original);

  expect(r.ok).toBe(true);
  const textoSaida = Buffer.from(r.bytes!).toString('latin1');
  expect(textoSaida).not.toContain('tapt');
});

test('remove fiel e chrm da sample entry de vídeo (avc1), mantém avcC e colr', () => {
  const amostraAvc1 = concat(
    u32(8 + 78 + 16 + 18), // size da entrada: header(8) + fixo(78) + avcC(16) + colr(18)
    ascii('avc1'),
    new Uint8Array(78), // campos fixos do VisualSampleEntry
    caixa('avcC', b(1, 0x42, 0, 0x1f)),
    caixa('colr', new Uint8Array(10)),
    caixa('fiel', new Uint8Array(2)),
    caixa('chrm', new Uint8Array(2)),
  );
  const stsd = caixa('stsd', b(0, 0, 0, 0), u32(1), amostraAvc1);
  const stbl = caixa('stbl', stsd, caixa('stco', b(0, 0, 0, 0), u32(0)));
  const trak = caixa('trak', caixa('mdia', caixa('minf', stbl)));
  const original = concat(ftypQt(), caixa('moov', trak), caixa('mdat', b(9)));

  const r = remuxarQuickTimeParaIsom(original);

  expect(r.ok).toBe(true);
  const textoSaida = Buffer.from(r.bytes!).toString('latin1');
  expect(textoSaida).not.toContain('fiel');
  expect(textoSaida).not.toContain('chrm');
  expect(textoSaida).toContain('avcC');
  expect(textoSaida).toContain('colr');
});

// Achado real #2 (2026-09-09): mesmo sem tapt/fiel/chrm/meta, o PJe ainda
// recusou — comparado de novo contra `ffmpeg -c copy` (que funciona), faltava
// normalizar a sample entry de ÁUDIO (version 1 do QuickTime, com um `wave`
// embrulhando o `esds`) e remover um `hdlr` duplicado dentro de `minf`.

test('remove hdlr duplicado de dentro de minf, mantém o de mdia', () => {
  const hdlrReal = caixa('hdlr', ascii('REAL'));
  const hdlrDuplicado = caixa('hdlr', ascii('DUPL'));
  const stbl = caixa('stbl', caixa('stco', b(0, 0, 0, 0), u32(0)));
  const minf = caixa('minf', hdlrDuplicado, stbl);
  const mdia = caixa('mdia', hdlrReal, minf);
  const original = concat(ftypQt(), caixa('moov', caixa('trak', mdia)), caixa('mdat', b(9)));

  const r = remuxarQuickTimeParaIsom(original);

  expect(r.ok).toBe(true);
  const textoSaida = Buffer.from(r.bytes!).toString('latin1');
  expect(textoSaida).toContain('REAL');
  expect(textoSaida).not.toContain('DUPL');
});

test('normaliza sample entry de áudio (mp4a) version 1 -> 0 e desembrulha wave para extrair o esds', () => {
  const camposFixos = concat(
    new Uint8Array(6),
    b(0, 1), // data_reference_index
    b(0, 1), // version = 1 (QuickTime)
    b(0, 0), // revision
    b(0, 0, 0, 0), // vendor
    b(0, 2), // channels
    b(0, 16), // sampleSize
    b(0, 0), // compressionId
    b(0, 0), // packetSize
    b(0xac, 0x44, 0, 0), // samplerate
  );
  const extra16DaVersao1 = new Uint8Array(16);
  const esdsReal = caixa('esds', b(0xaa, 0xbb, 0xcc));
  const wave = caixa(
    'wave',
    caixa('frma', ascii('mp4a')),
    caixa('mp4a', b(1, 2, 3, 4)), // placeholder aninhado, deve ser descartado
    esdsReal,
    concat(u32(8), b(0, 0, 0, 0)), // terminador do wave (size=8, tipo nulo)
  );
  const amostraMp4a = caixa('mp4a', camposFixos, extra16DaVersao1, wave);
  const stsd = caixa('stsd', b(0, 0, 0, 0), u32(1), amostraMp4a);
  const stbl = caixa('stbl', stsd, caixa('stco', b(0, 0, 0, 0), u32(0)));
  const original = concat(
    ftypQt(),
    caixa('moov', caixa('trak', caixa('mdia', caixa('minf', stbl)))),
    caixa('mdat', b(9)),
  );

  const r = remuxarQuickTimeParaIsom(original);

  expect(r.ok).toBe(true);
  const saida = r.bytes!;
  const textoSaida = Buffer.from(saida).toString('latin1');
  expect(textoSaida).not.toContain('wave');
  expect(textoSaida).not.toContain('frma');
  expect(textoSaida).toContain('esds');

  // Acha a entrada mp4a reconstruída e confere que a version virou 0.
  const idx = textoSaida.indexOf('mp4a');
  const entryOffset = idx - 4;
  const dv = new DataView(saida.buffer, saida.byteOffset, saida.byteLength);
  const version = dv.getUint16(entryOffset + 8 + 8);
  expect(version).toBe(0);

  // O esds reconstruído preserva o conteúdo original (mesmo "codec bytes").
  expect(textoSaida).toContain(Buffer.from([0xaa, 0xbb, 0xcc]).toString('latin1'));
});

test('descarta a caixa meta de dentro de moov (estilo QuickTime, sem version/flags)', () => {
  // No arquivo real, `meta` é filho direto de `moov`, irmão dos `trak` — não é
  // uma caixa de nível superior. O `hdlr`/`keys`/`ilst` vão junto, descartados.
  const stbl = caixa('stbl', caixa('stco', b(0, 0, 0, 0), u32(0)));
  const trak = caixa('trak', caixa('mdia', caixa('minf', stbl)));
  const metaQuickTime = caixa('meta', caixa('hdlr', new Uint8Array(20)), caixa('keys', new Uint8Array(8)));
  const original = concat(ftypQt(), caixa('moov', trak, metaQuickTime), caixa('mdat', b(9)));

  const r = remuxarQuickTimeParaIsom(original);

  expect(r.ok).toBe(true);
  const textoSaida = Buffer.from(r.bytes!).toString('latin1');
  expect(textoSaida).not.toContain('meta');
  expect(textoSaida).not.toContain('keys');
  // mdat continua presente e intacto.
  expect(r.bytes!.subarray(r.bytes!.length - 1)).toEqual(b(9));
});
