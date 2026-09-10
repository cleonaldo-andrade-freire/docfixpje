/**
 * Construtor de MP4/MOV sintético, byte a byte (spec §1.5 — nenhuma fixture
 * baixada de terceiro).
 *
 * O objetivo não é gerar vídeo decodificável: é gerar CONTAINERS fiéis, para
 * exercitar a detecção de tipo e o remux QuickTime→MP4. As amostras dentro do
 * `mdat` são preenchimento; o que importa é que `stco`/`stsz`/`stsc` apontem
 * corretamente para elas, para que o remux possa ser verificado byte a byte.
 */

export interface OpcoesMp4 {
  /** Container QuickTime: brand `qt  `, `mp4a` v1 com `wave`, `dref` `alis`, `tapt`… */
  quicktime?: boolean;
  /** Trilha de áudio além da de vídeo. */
  comAudio?: boolean;
  /** Bytes de preenchimento do mdat, além das amostras. */
  recheioMdat?: number;
  /** `moov` antes do `mdat` (o layout que obriga o remux a relocar os chunks). */
  moovPrimeiro?: boolean;
  /** `hvc1` (HEVC) simula o vídeo de iPhone recente, que o PJe não aceita. */
  codecVideo?: 'avc1' | 'hvc1';
}

const TIMESCALE = 600;
const DURACAO = 600; // 1 segundo
const LARGURA = 320;
const ALTURA = 240;
const AMOSTRAS_VIDEO = 4;
const TAM_AMOSTRA_VIDEO = 64;
const AMOSTRAS_AUDIO = 4;
const TAM_AMOSTRA_AUDIO = 32;

function caixa(tipo: string, ...partes: Buffer[]): Buffer {
  const payload = Buffer.concat(partes);
  const cab = Buffer.alloc(8);
  cab.writeUInt32BE(payload.length + 8, 0);
  cab.write(tipo, 4, 'latin1');
  return Buffer.concat([cab, payload]);
}

function u32(...vs: number[]): Buffer {
  const b = Buffer.alloc(vs.length * 4);
  vs.forEach((v, i) => b.writeUInt32BE(v >>> 0, i * 4));
  return b;
}

function u16(...vs: number[]): Buffer {
  const b = Buffer.alloc(vs.length * 2);
  vs.forEach((v, i) => b.writeUInt16BE(v & 0xffff, i * 2));
  return b;
}

const zeros = (n: number) => Buffer.alloc(n, 0x00);

/** Matriz identidade do QuickTime/MP4 (9 valores 16.16 / 2.30). */
const MATRIZ = u32(0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000);

function mvhd(): Buffer {
  return caixa(
    'mvhd',
    u32(0), // version 0 + flags
    u32(0, 0, TIMESCALE, DURACAO),
    u32(0x10000), // rate 1.0
    u16(0x0100), // volume 1.0
    zeros(10),
    MATRIZ,
    zeros(24), // pre_defined
    u32(3), // next_track_id
  );
}

function tkhd(id: number, video: boolean): Buffer {
  return caixa(
    'tkhd',
    u32(0x00000007), // version 0, flags: enabled | in movie | in preview
    u32(0, 0, id, 0, DURACAO),
    zeros(8),
    u16(0, 0), // layer, alternate_group
    u16(video ? 0 : 0x0100, 0), // volume
    MATRIZ,
    u32(video ? LARGURA * 0x10000 : 0, video ? ALTURA * 0x10000 : 0),
  );
}

function mdhd(timescale: number, duracao: number): Buffer {
  return caixa('mdhd', u32(0), u32(0, 0, timescale, duracao), u16(0x55c4, 0)); // 'und'
}

function hdlr(tipo: string, nome: string): Buffer {
  return caixa(
    'hdlr',
    u32(0),
    u32(0),
    Buffer.from(tipo, 'latin1'),
    zeros(12),
    Buffer.from(`${nome}\0`, 'latin1'),
  );
}

/** `dref` self-contained. Em QuickTime a entrada é `alis`; em MP4, `url `. */
function dinf(quicktime: boolean): Buffer {
  const entrada = caixa(quicktime ? 'alis' : 'url ', u32(0x00000001));
  return caixa('dinf', caixa('dref', u32(0), u32(1), entrada));
}

function avcC(): Buffer {
  // SPS/PPS de preenchimento: o container é o que está sendo testado.
  const sps = Buffer.from([0x67, 0x42, 0x00, 0x1f, 0xda, 0x01, 0x40, 0x16, 0xe8]);
  const pps = Buffer.from([0x68, 0xce, 0x3c, 0x80]);
  return caixa(
    'avcC',
    Buffer.from([0x01, 0x42, 0x00, 0x1f, 0xff, 0xe1]),
    u16(sps.length),
    sps,
    Buffer.from([0x01]),
    u16(pps.length),
    pps,
  );
}

function avc1(quicktime: boolean, codec: 'avc1' | 'hvc1' = 'avc1'): Buffer {
  // `colr` do QuickTime é `nclc`; o do MP4 é `nclx` (+ full_range_flag).
  const colr = quicktime
    ? caixa('colr', Buffer.from('nclc', 'latin1'), u16(1, 1, 1))
    : caixa('colr', Buffer.from('nclx', 'latin1'), u16(1, 1, 1), Buffer.from([0x00]));
  // `fiel` e `chrm` só existem no QuickTime e confundem o demuxer do PJe.
  const soQt = quicktime
    ? [caixa('fiel', Buffer.from([0x01, 0x00])), caixa('chrm', Buffer.from([0x00, 0x02]))]
    : [];

  const compressorname = Buffer.alloc(32);
  compressorname.writeUInt8(5, 0);
  compressorname.write('H.264', 1, 'latin1');

  return caixa(
    codec,
    zeros(6),
    u16(1), // data_reference_index
    u16(0, 0), // pre_defined, reserved
    zeros(12), // pre_defined[3]
    u16(LARGURA, ALTURA),
    u32(0x00480000, 0x00480000), // 72 dpi
    u32(0),
    u16(1), // frame_count
    compressorname,
    u16(0x0018), // depth
    Buffer.from([0xff, 0xff]), // pre_defined = -1
    // `hvcC` de preenchimento: a fixture existe para o remux RECUSAR o HEVC,
    // então basta o 4CC do codec estar certo.
    codec === 'hvc1' ? caixa('hvcC', Buffer.from([0x01, 0x01, 0x60, 0x00])) : avcC(),
    colr,
    ...soQt,
  );
}

/** AAC-LC 44100 estéreo. O ESDS é de preenchimento, mas bem-formado. */
function esds(): Buffer {
  const dsi = Buffer.from([0x12, 0x10]); // AudioSpecificConfig: AAC-LC, 44100, 2 canais
  const decSpecific = Buffer.concat([Buffer.from([0x05, 0x80, 0x80, 0x80, dsi.length]), dsi]);
  const decConfig = Buffer.concat([
    Buffer.from([0x04, 0x80, 0x80, 0x80, 13 + decSpecific.length, 0x40, 0x15]),
    Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    decSpecific,
  ]);
  const slConfig = Buffer.from([0x06, 0x80, 0x80, 0x80, 0x01, 0x02]);
  const es = Buffer.concat([
    Buffer.from([0x03, 0x80, 0x80, 0x80, 3 + decConfig.length + slConfig.length, 0x00, 0x01, 0x00]),
    decConfig,
    slConfig,
  ]);
  return caixa('esds', u32(0), es);
}

function mp4a(quicktime: boolean): Buffer {
  const taxa = u32(44100 * 0x10000);
  if (!quicktime) {
    return caixa(
      'mp4a',
      zeros(6),
      u16(1), // data_reference_index
      u16(0, 0), // version 0, revision
      u32(0), // vendor
      u16(2, 16), // channels, sample size
      u16(0, 0), // compressionID, packet size
      taxa,
      esds(),
    );
  }
  // Sound sample description v1 do QuickTime: 16 bytes extras e o `esds`
  // escondido dentro de um `wave`. É o que o demuxer do PJe não entende.
  const wave = caixa(
    'wave',
    caixa('frma', Buffer.from('mp4a', 'latin1')),
    caixa('mp4a', u32(0)),
    esds(),
    u32(0), // terminador do wave
  );
  return caixa(
    'mp4a',
    zeros(6),
    u16(1),
    u16(1, 0), // version 1
    u32(0),
    u16(2, 16),
    Buffer.from([0xff, 0xfe]), // compressionID = -2 (variável)
    u16(0),
    taxa,
    u32(1024, 1, 2, 2), // samplesPerPacket, bytesPerPacket, bytesPerFrame, bytesPerSample
    wave,
  );
}

interface Trilha {
  video: boolean;
  amostras: number;
  tamAmostra: number;
  timescale: number;
  codec?: 'avc1' | 'hvc1';
}

/** stbl com uma amostra por chunk — assim `stco` tem um offset por amostra. */
function stbl(t: Trilha, quicktime: boolean, offsets: number[]): Buffer {
  const stsc = caixa('stsc', u32(0), u32(1), u32(1, 1, 1));
  const stts = caixa('stts', u32(0), u32(1), u32(t.amostras, t.timescale / t.amostras));
  const stsz = caixa('stsz', u32(0), u32(t.tamAmostra), u32(t.amostras));
  const stco = caixa('stco', u32(0), u32(offsets.length), u32(...offsets));
  return caixa(
    'stbl',
    caixa('stsd', u32(0), u32(1), t.video ? avc1(quicktime, t.codec ?? 'avc1') : mp4a(quicktime)),
    stts,
    stsc,
    stsz,
    stco,
  );
}

function trak(t: Trilha, id: number, quicktime: boolean, offsets: number[]): Buffer {
  const minf = caixa(
    'minf',
    t.video ? caixa('vmhd', u32(0x00000001), u16(0, 0, 0, 0)) : caixa('smhd', u32(0), u16(0, 0)),
    // O `hdlr` de data handler dentro de `minf` só existe em QuickTime.
    ...(quicktime ? [hdlr('alis', 'Handler alias')] : []),
    dinf(quicktime),
    stbl(t, quicktime, offsets),
  );
  const mdia = caixa(
    'mdia',
    mdhd(t.timescale, t.timescale),
    hdlr(t.video ? 'vide' : 'soun', t.video ? 'VideoHandler' : 'SoundHandler'),
    minf,
  );
  // `tapt` (track aperture) é exclusivo do QuickTime.
  const tapt = quicktime
    ? [caixa('tapt', caixa('clef', u32(0), u32(LARGURA * 0x10000, ALTURA * 0x10000)))]
    : [];
  return caixa('trak', tkhd(id, t.video), ...tapt, mdia);
}

/**
 * Monta o arquivo. O `moov` é construído duas vezes: a primeira só para medir
 * seu tamanho, já que os offsets do `stco` dependem de onde o `mdat` vai cair.
 */
export function montarMp4(opcoes: OpcoesMp4 = {}): Uint8Array {
  const {
    quicktime = false,
    comAudio = true,
    recheioMdat = 0,
    moovPrimeiro = false,
    codecVideo = 'avc1',
  } = opcoes;

  const trilhas: Trilha[] = [
    { video: true, amostras: AMOSTRAS_VIDEO, tamAmostra: TAM_AMOSTRA_VIDEO, timescale: TIMESCALE, codec: codecVideo },
    ...(comAudio
      ? [{ video: false, amostras: AMOSTRAS_AUDIO, tamAmostra: TAM_AMOSTRA_AUDIO, timescale: 44100 }]
      : []),
  ];

  const bytesMidia = trilhas.reduce((n, t) => n + t.amostras * t.tamAmostra, 0);
  const mdatPayload = Buffer.alloc(bytesMidia + recheioMdat, 0x00);
  // Preenchimento reconhecível: byte i = i % 251, para que uma troca de offsets
  // no remux apareça como divergência em vez de passar despercebida entre zeros.
  for (let i = 0; i < mdatPayload.length; i++) mdatPayload[i] = i % 251;

  const ftyp = quicktime
    ? caixa('ftyp', Buffer.from('qt  ', 'latin1'), u32(0x20050300), Buffer.from('qt  ', 'latin1'))
    : caixa(
        'ftyp',
        Buffer.from('isom', 'latin1'),
        u32(0x200),
        Buffer.from('isomiso2avc1mp41', 'latin1'),
      );

  const montarMoov = (inicioMdatDados: number): Buffer => {
    let cursor = inicioMdatDados;
    const traks = trilhas.map((t, i) => {
      const offsets: number[] = [];
      for (let k = 0; k < t.amostras; k++) {
        offsets.push(cursor);
        cursor += t.tamAmostra;
      }
      return trak(t, i + 1, quicktime, offsets);
    });
    return caixa('moov', mvhd(), ...traks);
  };

  const mdat = caixa('mdat', mdatPayload);

  if (!moovPrimeiro) {
    const moov = montarMoov(ftyp.length + 8);
    return new Uint8Array(Buffer.concat([ftyp, mdat, moov]));
  }

  // Duas passadas: o tamanho do moov não muda com o valor dos offsets (4 bytes
  // cada), então medir com offsets provisórios e remontar é exato.
  const tamMoov = montarMoov(0).length;
  const moov = montarMoov(ftyp.length + tamMoov + 8);
  return new Uint8Array(Buffer.concat([ftyp, moov, mdat]));
}

/** MP4 estruturalmente incompleto: tem `moov`, mas nenhuma trilha. */
export function montarMp4SemTrilha(): Uint8Array {
  const ftyp = caixa(
    'ftyp',
    Buffer.from('isom', 'latin1'),
    u32(0),
    Buffer.from('isommp41', 'latin1'),
  );
  return new Uint8Array(
    Buffer.concat([ftyp, caixa('moov', mvhd()), caixa('mdat', Buffer.alloc(2048, 0x00))]),
  );
}
