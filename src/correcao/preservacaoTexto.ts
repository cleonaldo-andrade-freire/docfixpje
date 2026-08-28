import { LIMITES } from '../config/limites';
import { comoTexto } from '../pdf/estrutura';

/**
 * Verificação de preservação de texto pós-correção (spec §8.2, §14.3 — teste
 * bloqueante). A solução manual (imprimir pelo navegador) às vezes rasteriza o
 * conteúdo; a correção automática não pode reproduzir esse defeito.
 *
 * Extração deliberadamente crua (operadores `Tj`/`TJ` do content stream, sem
 * pdfjs-dist) para manter o projeto com poucas dependências. Suficiente para o
 * critério de "texto continua extraível e equivalente": compara o conjunto de
 * palavras por similaridade de Jaccard.
 */

/** Lê um literal de string PDF a partir do '(' em `i`, respeitando parênteses
 *  balanceados e escapes. Retorna o conteúdo e o índice logo após o ')'. */
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

export function extrairTextoCru(bytes: Uint8Array): string {
  const s = comoTexto(bytes);
  const partes: string[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '(') continue;
    const { conteudo, fim } = lerStringPdf(s, i);
    // segue um operador de texto? (Tj, TJ, ', ")
    const cauda = s.slice(fim, fim + 12);
    if (/^[\s\d.\-\][]*(Tj|TJ|'|")/.test(cauda)) {
      partes.push(desescapar(conteudo));
    }
    i = fim - 1;
  }
  return partes.join(' ');
}

function desescapar(t: string): string {
  return t
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\n/g, ' ')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ');
}

export function normalizarTexto(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-\s+/g, '') // hifenização de quebra de linha
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
  const union = a.size + b.size - inter;
  return inter / union;
}

export interface ResultadoPreservacao {
  preservado: boolean;
  similaridade: number;
}

export function textoPreservado(antes: Uint8Array, depois: Uint8Array): ResultadoPreservacao {
  const similaridade = similaridadeTexto(extrairTextoCru(antes), extrairTextoCru(depois));
  return { preservado: similaridade >= LIMITES.LIMIAR_PRESERVACAO_TEXTO, similaridade };
}
