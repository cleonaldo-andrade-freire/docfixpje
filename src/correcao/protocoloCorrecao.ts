import type { Ocorrencia, ResultadoCorrecao } from '../tipos';
import type { ConfigValidacao } from '../validadores/contexto';

export type ParaCorrecao = {
  tipo: 'corrigir';
  nomeArquivo: string;
  buffer: ArrayBuffer;
  ocorrencias: Ocorrencia[];
  config?: ConfigValidacao;
  /** ?e2e=<modo>: motor falso do Playwright (nunca em produção). */
  e2e?: string;
};

export type DaCorrecao =
  | { tipo: 'motorCarregando'; frac: number }
  | { tipo: 'etapa'; mensagem: string }
  | { tipo: 'resultado'; resultado: ResultadoCorrecao; bufferCorrigido: ArrayBuffer | null }
  | { tipo: 'motorIndisponivel' }
  | { tipo: 'erro'; mensagem: string };
