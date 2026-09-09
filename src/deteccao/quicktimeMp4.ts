import { encontrarCaixasPorTipo } from './caixasMp4';

/**
 * Vídeos de iPhone/WhatsApp costumam ter extensão .mp4 mas contêiner
 * QuickTime (`ftyp` major brand "qt"), que `ehMp4()` (detectarTipo.ts, §16.6)
 * rejeita de propósito. Quando o codec interno é avc1/mp4a — o único caso que
 * sabemos remuxar sem recodificar (remuxMp4.ts) — vale diagnosticar e
 * corrigir em vez de reportar "formato não suportado" genérico.
 */

/** Formatos de sample description que o remux (só troca de contêiner) sabe tratar. */
const CODECS_SUPORTADOS = new Set(['avc1', 'mp4a']);

function textoAscii(bytes: Uint8Array, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[offset + i] ?? 0);
  return s;
}

export function ehContainerQuickTime(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  if (textoAscii(bytes, 4, 4) !== 'ftyp') return false;
  return textoAscii(bytes, 8, 4).trim().toLowerCase() === 'qt';
}

function listarFormatosStsd(bytes: Uint8Array): string[] {
  const stsds = encontrarCaixasPorTipo(bytes, new Set(['stsd']));
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const formatos: string[] = [];
  for (const stsd of stsds) {
    const offsetContagem = stsd.offset + stsd.tamanhoCabecalho + 4;
    const contagem = dv.getUint32(offsetContagem);
    let p = offsetContagem + 4;
    for (let i = 0; i < contagem; i++) {
      const tamanhoEntrada = dv.getUint32(p);
      if (tamanhoEntrada < 8) break;
      formatos.push(textoAscii(bytes, p + 4, 4));
      p += tamanhoEntrada;
    }
  }
  return formatos;
}

/** Só considera suportado se houver pelo menos um stsd e todos os codecs forem avc1/mp4a. */
export function codecMp4Suportado(bytes: Uint8Array): boolean {
  const formatos = listarFormatosStsd(bytes);
  return formatos.length > 0 && formatos.every((f) => CODECS_SUPORTADOS.has(f));
}
