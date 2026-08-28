import type { ConformidadePdfa } from '../tipos';

/**
 * Extração e leitura do XMP para a Regra 3 nível 1 (spec §7.3, §16.5).
 * Sem DOMParser: precisa rodar dentro de Web Worker, que não tem DOM.
 */

export function extrairXmp(bytes: Uint8Array): string | null {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  const ini = s.indexOf('<?xpacket begin');
  if (ini === -1) return null;
  const fimMarca = s.indexOf('<?xpacket end', ini);
  const fim = fimMarca === -1 ? s.length : s.indexOf('?>', fimMarca) + 2;
  return s.slice(ini, fim);
}

const NS_PDFAID = 'http://www.aiim.org/pdfa/ns/id/';

export function lerPdfaId(
  xmp: string,
): { parte: number; conformidade: ConformidadePdfa } | null {
  const prefixos = new Set<string>();
  const reNs = /xmlns:([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = reNs.exec(xmp)) !== null) {
    if (m[2] === NS_PDFAID) prefixos.add(m[1]!);
  }
  if (prefixos.size === 0) return null;

  const alt = [...prefixos].map((p) => p.replace(/-/g, '\\-')).join('|');
  const achar = (campo: 'part' | 'conformance'): string | null => {
    const attr = new RegExp(`(?:${alt}):${campo}\\s*=\\s*"([^"]+)"`);
    const elem = new RegExp(`<(?:${alt}):${campo}\\s*>\\s*([^<\\s]+)\\s*</(?:${alt}):${campo}>`);
    const a = xmp.match(attr) ?? xmp.match(elem);
    return a ? a[1]! : null;
  };

  const parteStr = achar('part');
  const confStr = achar('conformance');
  if (parteStr === null && confStr === null) return null;

  const parte = Number(parteStr);
  const conformidade = (confStr ?? '').toUpperCase();
  if (![1, 2, 3, 4].includes(parte)) return null;
  if (!['A', 'B', 'U'].includes(conformidade)) return null;
  return { parte, conformidade: conformidade as ConformidadePdfa };
}
