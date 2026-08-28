import type { TipoDetectado } from '../tipos';

/**
 * Detecção de tipo por magic number / bytes de cabeçalho (spec §4, §16.6).
 * Nunca por extensão nem pelo MIME do navegador.
 */

const BRANDS_MP4_ACEITAS = new Set(['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'dash']);

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

/** Tag ID3 no offset 0, ou frame sync MPEG-1/2 audio com bitrate válido. */
function ehMp3(bytes: Uint8Array): boolean {
  if (texto(bytes, 0, 3) === 'ID3') return true;
  const limite = Math.min(bytes.length - 3, 4096);
  for (let i = 0; i < limite; i++) {
    if (bytes[i] !== 0xff) continue;
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0xff;
    const sync = (b1 & 0xe0) === 0xe0; // 3 bits altos ligados
    const layerValido = (b1 & 0x06) !== 0; // 00 = reservado
    const bitrateValido = (b2 >> 4) !== 0x0f; // 1111 = inválido
    if (sync && layerValido && bitrateValido) return true;
  }
  return false;
}

/** Box `ftyp` no offset 4 e major/compatible brand em allowlist (rejeita MOV/M4A). */
function ehMp4(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (texto(bytes, 4, 4) !== 'ftyp') return false;

  const major = texto(bytes, 8, 4).trim().toLowerCase();
  if (BRANDS_MP4_ACEITAS.has(major)) return true;

  const tamBox = Math.min(
    ((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0),
    bytes.length,
  );
  for (let o = 16; o + 4 <= tamBox; o += 4) {
    if (BRANDS_MP4_ACEITAS.has(texto(bytes, o, 4).trim().toLowerCase())) return true;
  }
  return false;
}

export function detectarTipo(bytes: Uint8Array): TipoDetectado | null {
  if (bytes.length < 4) return null;
  if (ehPdf(bytes)) return 'application/pdf';
  if (ehMp4(bytes)) return 'video/mp4';
  if (ehMp3(bytes)) return 'audio/mpeg';
  return null;
}
