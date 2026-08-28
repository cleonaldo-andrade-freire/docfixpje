import type { MotorPdf } from './motor';

/**
 * Motores de correção FALSOS para o Playwright, ativados só com `?e2e=` na URL
 * (ver `corrigirArquivo`). Nunca são usados sem o parâmetro.
 * - `?e2e=1`   → remove a assinatura preservando o texto (fluxo "corrigido")
 * - `?e2e=falha` → devolve a entrada intacta (revalidação reprova → "correcao_falhou")
 */

const motorSucesso: MotorPdf = {
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
    return { codigo: 0, bytes, log: 'motor de teste e2e (sucesso)' };
  },
};

const motorFalha: MotorPdf = {
  async executar(entrada) {
    return { codigo: 0, bytes: entrada.slice(), log: 'motor de teste e2e (falha simulada)' };
  },
};

export function motorFalsoE2E(modo: string): MotorPdf {
  return modo === 'falha' ? motorFalha : motorSucesso;
}

export function modoE2E(): string | null {
  try {
    if (typeof location === 'undefined') return null;
    return new URLSearchParams(location.search).get('e2e');
  } catch {
    return null;
  }
}
