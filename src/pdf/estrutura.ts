import { PDFDocument, EncryptedPDFError } from 'pdf-lib';

/**
 * Carga e varredura de baixo nível de PDFs.
 *
 * A varredura por bytes (Latin-1) é a fonte PRIMÁRIA da Regra 1 (spec §7.1):
 * o pdf-lib nem sempre expõe /SigFlags e não enxerga assinaturas adicionadas
 * por incremental update. O pdf-lib entra só para detectar criptografia
 * (EncryptedPDFError) e, mais adiante, nomear campos quando conseguir carregar.
 */

export type CargaPdf =
  | { ok: true; doc: PDFDocument }
  | { ok: false; motivo: 'ARQUIVO_CRIPTOGRAFADO' | 'ARQUIVO_CORROMPIDO' };

export async function carregarPdf(bytes: Uint8Array): Promise<CargaPdf> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return { ok: true, doc };
  } catch (e) {
    // O pdf-lib lança EncryptedPDFError, mas o transpile do pacote quebra a
    // cadeia de protótipos e `instanceof` falha em parte dos ambientes — daí o
    // fallback pela mensagem (estável entre versões).
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof EncryptedPDFError || /\bencrypted\b/i.test(msg)) {
      return { ok: false, motivo: 'ARQUIVO_CRIPTOGRAFADO' };
    }
    return { ok: false, motivo: 'ARQUIVO_CORROMPIDO' };
  }
}

export interface TrailerBruto {
  temEncrypt: boolean;
  temByteRangeEContents: boolean;
  temPerms: boolean;
  temDocMDP: boolean;
  temUR3: boolean;
  temAcroForm: boolean;
  /** Valor de /SigFlags, se presente. */
  sigFlags: number | null;
  /** Nomes (/T) dos campos /FT /Sig encontrados. */
  nomesCamposSig: string[];
  /** Quantos desses campos têm /V (assinatura preenchida). */
  camposSigComV: number;
}

/** Latin-1: cada byte vira uma code unit. Seguro para varrer sintaxe PDF. */
function comoTexto(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return s;
}

export function varrerTrailerBruto(bytes: Uint8Array): TrailerBruto {
  const s = comoTexto(bytes);

  const sigFlagsMatch = s.match(/\/SigFlags\s+(\d+)/);
  const sigFlags = sigFlagsMatch ? Number(sigFlagsMatch[1]) : null;

  const temByteRange = /\/ByteRange\s*\[/.test(s);
  const temContents = /\/Contents\s*<[0-9A-Fa-f\s]+>/.test(s);

  const nomes: string[] = [];
  let comV = 0;
  const re = /\/FT\s*\/Sig\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const janela = s.slice(Math.max(0, m.index - 400), m.index + 400);
    const nome = janela.match(/\/T\s*\(([^)]*)\)/);
    nomes.push(nome ? nome[1]! : `campo_${nomes.length + 1}`);
    if (/\/V\s+\d+\s+\d+\s+R/.test(janela) || /\/V\s*<</.test(janela)) comV++;
  }

  return {
    temEncrypt: /\/Encrypt\b/.test(s),
    temByteRangeEContents: temByteRange && temContents,
    temPerms: /\/Perms\b/.test(s),
    temDocMDP: /\/DocMDP\b/.test(s),
    temUR3: /\/UR3\b/.test(s),
    temAcroForm: /\/AcroForm\b/.test(s),
    sigFlags,
    nomesCamposSig: nomes,
    camposSigComV: comV,
  };
}
