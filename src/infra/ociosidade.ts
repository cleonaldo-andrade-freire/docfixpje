import { LIMITES } from '../config/limites';

/**
 * Timer de ociosidade: descarta a sessão após inatividade (spec §9.5).
 * Útil no computador compartilhado do escritório.
 */

const EVENTOS_ATIVIDADE = ['pointerdown', 'keydown', 'dragover'] as const;

export interface ControleOciosidade {
  parar: () => void;
  /** Reinicia o timer manualmente (ao adicionar arquivo, validar, etc). */
  cutucar: () => void;
}

export function iniciarOciosidade(
  onExpirar: () => void,
  ms: number = LIMITES.OCIOSIDADE_MS,
): ControleOciosidade {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ativo = true;

  const reagendar = () => {
    if (!ativo) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      ativo = false;
      remover();
      onExpirar();
    }, ms);
  };

  const aoInteragir = () => reagendar();

  const alvo: EventTarget | null = typeof window !== 'undefined' ? window : null;
  const remover = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (alvo) {
      for (const ev of EVENTOS_ATIVIDADE) alvo.removeEventListener(ev, aoInteragir);
    }
  };

  if (alvo) {
    for (const ev of EVENTOS_ATIVIDADE) alvo.addEventListener(ev, aoInteragir, { passive: true });
  }
  reagendar();

  return {
    parar: () => {
      ativo = false;
      remover();
    },
    cutucar: reagendar,
  };
}
