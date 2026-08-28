import type { MotorPdf } from './motor';

/**
 * Motor de correção FALSO para o Playwright (ativado só com `?e2e=1` na URL,
 * ver `corrigirArquivo`). Reescreve o PDF removendo a camada de assinatura e
 * preservando o texto — suficiente para exercitar o fluxo "corrigido" de ponta
 * a ponta sem um build de Ghostscript-WASM. NUNCA é usado sem o flag.
 */
export const motorFalsoE2E: MotorPdf = {
  async executar(entrada) {
    let s = Array.from(entrada, (b) => String.fromCharCode(b)).join('');
    s = s
      .replace(/\/SigFlags\s+\d+/g, '/SigFlags 0')
      .replace(/\/ByteRange\s*\[[^\]]*\]/g, '')
      .replace(/\/Contents\s*<[0-9A-Fa-f\s]*>/g, '')
      .replace(/\/FT\s*\/Sig/g, '/FT /Tx')
      .replace(/\/AcroForm[^R]*R/g, '')
      .replace(/\/Perms[^>]*>>/g, '');
    const bytes = new Uint8Array(Array.from(s, (c) => c.charCodeAt(0) & 0xff));
    return { codigo: 0, bytes, log: 'motor de teste e2e' };
  },
};

export function e2eAtivo(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).has('e2e');
  } catch {
    return false;
  }
}
