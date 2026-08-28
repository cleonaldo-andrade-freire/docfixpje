/**
 * Máquina de estados explícita da linha do arquivo (spec §6).
 * Transições inválidas lançam erro em desenvolvimento.
 */

export type EstadoLinha =
  | 'aguardando'
  | 'validando'
  | 'apto'
  | 'inapto'
  | 'corrigindo'
  | 'corrigido'
  | 'correcao_falhou'
  | 'nao_corrigivel';

export const TRANSICOES: Record<EstadoLinha, readonly EstadoLinha[]> = {
  aguardando: ['validando'],
  validando: ['apto', 'inapto'],
  apto: [],
  inapto: ['corrigindo'],
  corrigindo: ['corrigido', 'correcao_falhou', 'nao_corrigivel'],
  corrigido: [],
  correcao_falhou: [],
  nao_corrigivel: [],
};

/** Texto da linha para estados de resultado (spec §6). */
export const TEXTO_ESTADO: Record<EstadoLinha, string> = {
  aguardando: 'Aguardando validação',
  validando: 'Validando…',
  apto: 'Pronto para anexar ao PJe',
  inapto: 'Não apto',
  corrigindo: 'Corrigindo…',
  corrigido: 'Corrigido — revalidado com sucesso',
  correcao_falhou: 'Não foi possível corrigir automaticamente',
  nao_corrigivel: 'Não é possível corrigir automaticamente',
};

const ehDev = (): boolean => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return process.env['NODE_ENV'] !== 'production';
  }
};

export function transicaoValida(atual: EstadoLinha, proximo: EstadoLinha): boolean {
  return TRANSICOES[atual].includes(proximo);
}

/**
 * Aplica a transição. Em desenvolvimento, transição inválida lança;
 * em produção, registra e mantém o estado atual.
 */
export function transicionar(atual: EstadoLinha, proximo: EstadoLinha): EstadoLinha {
  if (transicaoValida(atual, proximo)) return proximo;
  const msg = `transição inválida: ${atual} -> ${proximo}`;
  if (ehDev()) throw new Error(msg);
  console.error(msg);
  return atual;
}
