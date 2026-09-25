import type { PDFDocument } from 'pdf-lib';

/**
 * Carga e varredura de baixo nível de PDFs.
 *
 * A varredura por bytes (Latin-1) é a fonte PRIMÁRIA da Regra 1 (spec §7.1):
 * o pdf-lib nem sempre expõe /SigFlags e não enxerga assinaturas adicionadas
 * por incremental update. O pdf-lib entra só para detectar criptografia
 * (EncryptedPDFError) e, mais adiante, nomear campos quando conseguir carregar.
 *
 * O import do pdf-lib é DINÂMICO de propósito: `validarArquivo` roda também no
 * worker de mídia (a revalidação obrigatória do vídeo remuxado), e um import
 * estático arrastaria os ~270 KB da biblioteca para um worker que nunca abre um
 * PDF. Assim o chunk só é baixado quando um PDF é de fato carregado.
 */

export type CargaPdf =
  | { ok: true; doc: PDFDocument; encriptado: boolean }
  | { ok: false; motivo: 'ARQUIVO_CRIPTOGRAFADO' | 'ARQUIVO_CORROMPIDO' };

export async function carregarPdf(bytes: Uint8Array): Promise<CargaPdf> {
  const { PDFDocument, EncryptedPDFError } = await import('pdf-lib');
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

/**
 * Bits de permissão de /P (Tabela 22 da ISO 32000-1). São 1-indexados e a
 * semântica é invertida em relação ao nome do campo: bit LIGADO = operação
 * PERMITIDA. /P é um inteiro com sinal de 32 bits, e os bits reservados vêm
 * ligados — daí os valores negativos típicos (-1340, -3904…).
 */
export interface PermissoesPdf {
  /** Valor bruto de /P. */
  p: number;
  /** bit 3 — imprimir. */
  imprimir: boolean;
  /** bit 4 — alterar o conteúdo do documento. */
  modificarConteudo: boolean;
  /** bit 5 — copiar texto e gráficos. */
  copiarTexto: boolean;
  /** bit 6 — criar/alterar anotações e preencher campos de formulário. */
  anotar: boolean;
  /** bit 9 — preencher campos de formulário, inclusive campo de assinatura. */
  preencherFormulario: boolean;
  /** bit 11 — montar o documento (é o que autoriza o incremental update). */
  montarDocumento: boolean;
}

export interface CriptografiaPdf {
  /** /CFM do filtro de criptografia padrão (ex.: AESV3, AESV2, V2). */
  metodo: string | null;
  /** /V — algoritmo. */
  v: number | null;
  /** /R — revisão do handler de segurança. */
  r: number | null;
  /** null quando o dicionário não traz /P. */
  permissoes: PermissoesPdf | null;
}

/** bit n (1-indexado) de um inteiro de 32 bits com sinal. */
function bitLigado(p: number, n: number): boolean {
  return (p & (1 << (n - 1))) !== 0;
}

/**
 * Lê o dicionário de criptografia. Ele NUNCA é cifrado (senão não haveria como
 * decifrar o resto), então a varredura por bytes sempre o alcança.
 *
 * Retorna null quando não há /Encrypt no trailer.
 */
export function varrerCriptografia(bytes: Uint8Array): CriptografiaPdf | null {
  const s = comoTexto(bytes);
  if (!/\/Encrypt\b/.test(s)) return null;

  // /Encrypt costuma ser referência indireta: resolve o objeto apontado.
  let dict: string | null = null;
  const ref = s.match(/\/Encrypt\s+(\d+)\s+(\d+)\s+R/);
  if (ref) {
    const obj = new RegExp(`(?:^|[^0-9])${ref[1]}\\s+${ref[2]}\\s+obj([\\s\\S]{0,4000}?)endobj`).exec(s);
    if (obj) dict = obj[1]!;
  }
  // Dicionário embutido no trailer, ou objeto não localizado: cai no filtro padrão.
  if (dict === null) {
    const inline = s.match(/<<[^<>]*\/Filter\s*\/Standard[\s\S]{0,2000}?>>/);
    dict = inline ? inline[0] : null;
  }
  if (dict === null) return { metodo: null, v: null, r: null, permissoes: null };

  const num = (chave: string): number | null => {
    const m = dict!.match(new RegExp(`/${chave}\\s+(-?\\d+)`));
    return m ? Number(m[1]) : null;
  };

  const cfm = dict.match(/\/CFM\s*\/(\w+)/);
  const p = num('P');

  return {
    metodo: cfm ? cfm[1]! : null,
    v: num('V'),
    r: num('R'),
    permissoes:
      p === null
        ? null
        : {
            p,
            imprimir: bitLigado(p, 3),
            modificarConteudo: bitLigado(p, 4),
            copiarTexto: bitLigado(p, 5),
            anotar: bitLigado(p, 6),
            preencherFormulario: bitLigado(p, 9),
            montarDocumento: bitLigado(p, 11),
          },
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
