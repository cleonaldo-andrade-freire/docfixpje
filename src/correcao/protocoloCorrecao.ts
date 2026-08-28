import type { Ocorrencia, ResultadoCorrecao } from '../tipos';
import type { ConfigValidacao } from '../validadores/contexto';

export type ParaCorrecao = {
  tipo: 'corrigir';
  nomeArquivo: string;
  buffer: ArrayBuffer;
  ocorrencias: Ocorrencia[];
  config?: ConfigValidacao;
};

export type DaCorrecao =
  | { tipo: 'motorCarregando'; frac: number }
  | { tipo: 'etapa'; mensagem: string }
  | { tipo: 'resultado'; resultado: ResultadoCorrecao; bufferCorrigido: ArrayBuffer | null }
  | { tipo: 'motorIndisponivel' }
  | { tipo: 'erro'; mensagem: string };
