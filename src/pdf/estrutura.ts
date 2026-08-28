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
  | { ok: true; doc: PDFDocument; encriptado: boolean }
  | { ok: false; motivo: 'ARQUIVO_CRIPTOGRAFADO' | 'ARQUIVO_CORROMPIDO' };

export async function carregarPdf(bytes: Uint8Array): Promise<CargaPdf> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return { ok: true, doc, encriptado: false };
  } catch (e) {
    // O pdf-lib lança EncryptedPDFError, mas o transpile do pacote quebra a
    // cadeia de protótipos e `instanceof` falha em parte dos ambientes — daí o
    // fallback pela mensagem (estável entre versões).
    const msg = e instanceof Error ? e.message : String(e);
    const pareceCripto = e instanceof EncryptedPDFError || /\bencrypted\b/i.test(msg);
    if (pareceCripto) {
      // Muitos documentos oficiais (CTPS Digital, gov.br, CNIS) têm /Encrypt só
      // com senha de dono / restrições e abrem SEM senha. Tenta ignorar a cifra:
      // se a estrutura abre, o arquivo é utilizável e a correção (Ghostscript)
      // remove a cifra. Só é "protegido por senha" se nem assim abrir.
      try {
        const doc = await PDFDocument.load(bytes, {
          updateMetadata: false,
          ignoreEncryption: true,
        });
        return { ok: true, doc, encriptado: true };
      } catch {
        return { ok: false, motivo: 'ARQUIVO_CRIPTOGRAFADO' };
      }
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

const DECODER_LATIN1 = new TextDecoder('latin1');

/** Latin-1: cada byte vira uma code unit. Seguro para varrer sintaxe PDF. */
export function comoTexto(bytes: Uint8Array): string {
  return DECODER_LATIN1.decode(bytes);
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

export interface EstruturaPdfa {
  /** /OutputIntents com subtipo /GTS_PDFA1. */
  temOutputIntentPdfa: boolean;
  /** Algum /FontDescriptor sem /FontFile, /FontFile2 ou /FontFile3 próximo. */
  fonteNaoEmbutida: boolean;
  /** /JavaScript, /JS, /AA ou /OpenAction com script. */
  temJavaScript: boolean;
  /** /EmbeddedFiles no documento. */
  temEmbeddedFiles: boolean;
  /** Transparência: /SMask ≠ /None, /ca ou /CA < 1, ou /Group /S /Transparency. */
  temTransparencia: boolean;
  /** /Launch, /GoToR ou outra referência a recurso externo. */
  temReferenciaExterna: boolean;
}

/**
 * Verificações estruturais da Regra 3 nível 2 (spec §7.3), por varredura de
 * bytes — sem DOM, roda no worker. É heurística, não auditoria ISO 19005.
 */
export function varrerEstruturaPdfa(bytes: Uint8Array): EstruturaPdfa {
  const s = comoTexto(bytes);

  const temOutputIntentPdfa = /\/OutputIntents\b/.test(s) && /\/GTS_PDFA1\b/.test(s);

  // Só o dicionário de descritor tem "/Type /FontDescriptor"; a chave
  // "/FontDescriptor N 0 R" dentro do dict de fonte é uma referência, não conta.
  let fonteNaoEmbutida = false;
  const reFd = /\/Type\s*\/FontDescriptor\b/g;
  let fd: RegExpExecArray | null;
  while ((fd = reFd.exec(s)) !== null) {
    const janela = s.slice(fd.index, fd.index + 800);
    if (!/\/FontFile[23]?\b/.test(janela)) {
      fonteNaoEmbutida = true;
      break;
    }
  }

  const temJavaScript =
    /\/JavaScript\b/.test(s) ||
    /\/JS\s*[(<]/.test(s) ||
    /\/AA\s*<</.test(s) ||
    /\/OpenAction\b[\s\S]{0,160}?\/S\s*\/JavaScript\b/.test(s);

  const temEmbeddedFiles = /\/EmbeddedFiles\b/.test(s);

  const temTransparencia =
    /\/SMask\s*(?!\/None\b)(?:\/|\d)/.test(s) ||
    /\/ca\s+0?\.\d+/.test(s) ||
    /\/CA\s+0?\.\d+/.test(s) ||
    /\/Group\b[\s\S]{0,160}?\/S\s*\/Transparency\b/.test(s);

  const temReferenciaExterna = /\/Launch\b/.test(s) || /\/GoToR\b/.test(s);

  return {
    temOutputIntentPdfa,
    fonteNaoEmbutida,
    temJavaScript,
    temEmbeddedFiles,
    temTransparencia,
    temReferenciaExterna,
  };
}
