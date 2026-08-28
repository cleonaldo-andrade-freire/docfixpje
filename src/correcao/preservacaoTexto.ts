import { unzlibSync } from 'fflate';
import { LIMITES } from '../config/limites';
import { comoTexto } from '../pdf/estrutura';

/**
 * Verificação de preservação de texto pós-correção (spec §8.2, §14.3 — teste
 * bloqueante). A solução manual (imprimir pelo navegador) às vezes rasteriza o
 * conteúdo; a correção automática não pode reproduzir esse defeito.
 *
 * Extrai texto dos operadores `Tj`/`TJ` dos content streams. Como o Ghostscript
 * grava os streams comprimidos, primeiro infla os blocos `/FlateDecode` com
 * `DecompressionStream` (disponível no worker e no Node) — sem pdfjs, sem deps.
 */

function inflar(dados: Uint8Array): Uint8Array | null {
  try {
    return unzlibSync(dados);
  } catch {
    return null;
  }
}

/** Devolve o conteúdo textual concatenado de todos os content streams. */
function conteudoBruto(bytes: Uint8Array): string {
  const s = comoTexto(bytes);
  let out = '';
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const ini = m.index + m[0].length;
    const fim = s.indexOf('endstream', ini);
    if (fim === -1) continue;
    const cabecalho = s.slice(Math.max(0, m.index - 400), m.index);
    const bruto = bytes.subarray(ini, fim);
    if (/\/FlateDecode/.test(cabecalho)) {
      const inflado = inflar(bruto);
      if (inflado) out += ' ' + comoTexto(inflado);
    } else {
      out += ' ' + comoTexto(bruto);
    }
  }
  // fora de streams também (fixtures sintéticas usam streams sem filtro)
  return out + ' ' + s;
}

function desescapar(t: string): string {
  return t.replace(/\\([()\\])/g, '$1').replace(/\\[nrt]/g, ' ');
}

/** Lê um literal de string PDF a partir do '(' em `i`, respeitando aninhamento. */
function lerStringPdf(s: string, i: number): { conteudo: string; fim: number } {
  let depth = 0;
  let out = '';
  for (let j = i; j < s.length; j++) {
    const c = s[j]!;
    if (c === '\\') {
      out += s[j + 1] ?? '';
      j++;
      continue;
    }
    if (c === '(') {
      depth++;
      if (depth > 1) out += c;
      continue;
    }
    if (c === ')') {
      depth--;
      if (depth === 0) return { conteudo: out, fim: j + 1 };
      out += c;
      continue;
    }
    out += c;
  }
  return { conteudo: out, fim: s.length };
}

export function extrairTexto(bytes: Uint8Array): string {
  const s = conteudoBruto(bytes);
  const partes: string[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '(') continue;
    const { conteudo, fim } = lerStringPdf(s, i);
    if (/^[\s\d.\-\][]*(Tj|TJ|'|")/.test(s.slice(fim, fim + 12))) {
      partes.push(desescapar(conteudo));
    }
    i = fim - 1;
  }
  return partes.join(' ');
}

export function normalizarTexto(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-\s+/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(t: string): Set<string> {
  return new Set(normalizarTexto(t).split(' ').filter(Boolean));
}

export function similaridadeTexto(antes: string, depois: string): number {
  const a = tokens(antes);
  const b = tokens(depois);
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface ResultadoPreservacao {
  preservado: boolean;
  similaridade: number;
}

export function textoPreservado(antes: Uint8Array, depois: Uint8Array): ResultadoPreservacao {
  const similaridade = similaridadeTexto(extrairTexto(antes), extrairTexto(depois));
  return { preservado: similaridade >= LIMITES.LIMIAR_PRESERVACAO_TEXTO, similaridade };
}
