import type { TipoDetectado } from '../tipos';

/**
 * Detecção de tipo por magic number / bytes de cabeçalho (spec §4, §16.6).
 * Nunca por extensão nem pelo MIME do navegador.
 */

const BRANDS_MP4_ACEITAS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'dash', 'mmp4']);

/** Brands que denunciam um container QuickTime salvo como .mp4. */
const BRANDS_QUICKTIME = new Set(['qt', 'moov']);

/**
 * Boxes de topo que só aparecem em QuickTime sem `ftyp` — arquivos antigos do
 * QuickTime abrem direto no `moov`/`mdat`, sem declarar brand nenhuma.
 */
const TOPO_QUICKTIME = new Set(['moov', 'mdat', 'wide', 'pnot', 'skip']);

function acha(bytes: Uint8Array, alvo: readonly number[], ateOffset: number): boolean {
  const limite = Math.min(ateOffset, bytes.length - alvo.length);
  for (let i = 0; i <= limite; i++) {
    let ok = true;
    for (let j = 0; j < alvo.length; j++) {
      if (bytes[i + j] !== alvo[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

function texto(bytes: Uint8Array, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[offset + i] ?? 0);
  return s;
}

/** "%PDF-" dentro dos primeiros 1024 bytes (tolera BOM/prefixo). */
function ehPdf(bytes: Uint8Array): boolean {
  return acha(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d], 1024);
}

/* ------------------------------------------------------------------ *
 * MP3
 * ------------------------------------------------------------------ */

// Índice: [versão MPEG][layer][índice de bitrate]. Versão: 3=MPEG1, 2=MPEG2, 0=MPEG2.5.
const BITRATES_V1 = [
  [], // layer reservado
  [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], // Layer III
  [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], // Layer II
  [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], // Layer I
];
const BITRATES_V2 = [
  [],
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // Layer III
  [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // Layer II
  [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], // Layer I
];
const TAXAS: Readonly<Record<number, readonly number[]>> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};

/**
 * Valida um header de frame MPEG audio e devolve o tamanho do frame em bytes,
 * ou 0 se o header não for válido.
 *
 * A varredura ingênua por `0xFF 0xEx` casa por acaso em quase qualquer binário
 * — era assim que um MOV renomeado para .mp4 acabava classificado como MP3 e
 * passava na validação inteira. Aqui todos os campos são conferidos.
 */
function tamanhoFrameMp3(bytes: Uint8Array, i: number): number {
  if (i + 4 > bytes.length) return 0;
  const b1 = bytes[i + 1] ?? 0;
  const b2 = bytes[i + 2] ?? 0;
  if (bytes[i] !== 0xff || (b1 & 0xe0) !== 0xe0) return 0;

  const versao = (b1 >> 3) & 0x03; // 1 = reservado
  const layer = (b1 >> 1) & 0x03; // 0 = reservado
  if (versao === 1 || layer === 0) return 0;

  const idxBitrate = (b2 >> 4) & 0x0f;
  const idxTaxa = (b2 >> 2) & 0x03;
  if (idxBitrate === 0 || idxBitrate === 0x0f || idxTaxa === 3) return 0;

  const bitrate = (versao === 3 ? BITRATES_V1 : BITRATES_V2)[layer]?.[idxBitrate];
  const taxa = TAXAS[versao]?.[idxTaxa];
  if (!bitrate || !taxa) return 0;

  const padding = (b2 >> 1) & 0x01;
  const bps = bitrate * 1000;
  if (layer === 3) return (Math.floor((12 * bps) / taxa) + padding) * 4; // Layer I
  // Layer III em MPEG2/2.5 usa 576 amostras por frame em vez de 1152.
  const amostras = layer === 1 && versao !== 3 ? 72 : 144;
  return Math.floor((amostras * bps) / taxa) + padding;
}

/**
 * MP3 é reconhecido só onde o formato realmente permite: no início do arquivo
 * ou logo após a tag ID3v2. Além disso, dois frames encadeados têm de bater —
 * um único header plausível não é evidência suficiente.
 */
function ehMp3(bytes: Uint8Array): boolean {
  let inicio = 0;
  if (texto(bytes, 0, 3) === 'ID3') {
    // Tamanho syncsafe: 4 bytes de 7 bits úteis.
    const tam =
      (((bytes[6] ?? 0) & 0x7f) << 21) |
      (((bytes[7] ?? 0) & 0x7f) << 14) |
      (((bytes[8] ?? 0) & 0x7f) << 7) |
      ((bytes[9] ?? 0) & 0x7f);
    inicio = 10 + tam;
    // Só o cabeçalho ID3v2 já identifica o arquivo; o áudio pode estar além da janela lida.
    if (inicio >= bytes.length) return true;
  }

  // Tolera um punhado de bytes de lixo antes do primeiro frame, nada além disso.
  const limite = Math.min(inicio + 64, bytes.length - 4);
  for (let i = inicio; i <= limite; i++) {
    const tam = tamanhoFrameMp3(bytes, i);
    if (tam <= 0) continue;
    const proximo = i + tam;
    // Segundo frame confirmando, ou primeiro frame que vai até o fim do arquivo.
    if (proximo + 4 > bytes.length) return true;
    if (tamanhoFrameMp3(bytes, proximo) > 0) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * MP4 / QuickTime
 * ------------------------------------------------------------------ */

/**
 * Distingue MP4 ISO de QuickTime. Os dois compartilham a estrutura de boxes e a
 * extensão .mp4 no dia a dia, mas o PJe só aceita o primeiro — daí serem tipos
 * distintos aqui, e não um só "vídeo".
 */
function ehIsoBmff(bytes: Uint8Array): TipoDetectado | null {
  if (bytes.length < 12) return null;

  if (texto(bytes, 4, 4) === 'ftyp') {
    const brands: string[] = [];
    const tamBox = Math.min(
      ((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0),
      bytes.length,
    );
    for (let o = 8; o + 4 <= tamBox; o += 4) {
      if (o === 12) continue; // minor_version, não é brand
      brands.push(texto(bytes, o, 4).trim().toLowerCase());
    }

    const major = brands[0] ?? '';
    if (BRANDS_QUICKTIME.has(major)) return 'video/quicktime';
    if (brands.some((b) => BRANDS_MP4_ACEITAS.has(b))) return 'video/mp4';
    // ftyp presente mas de outra família (3gp, heic, m4a…): não é MP4 do PJe.
    return null;
  }

  // QuickTime antigo, sem ftyp: o arquivo abre direto num box de topo do QT.
  if (TOPO_QUICKTIME.has(texto(bytes, 4, 4))) return 'video/quicktime';
  return null;
}

export function detectarTipo(bytes: Uint8Array): TipoDetectado | null {
  if (bytes.length < 4) return null;
  if (ehPdf(bytes)) return 'application/pdf';
  const video = ehIsoBmff(bytes);
  if (video) return video;
  if (ehMp3(bytes)) return 'audio/mpeg';
  return null;
}
