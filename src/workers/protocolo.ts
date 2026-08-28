import type { ResultadoValidacao } from '../tipos';

/** Mensagens trocadas entre a thread principal e o worker de validação. */

export type ParaWorker = {
  tipo: 'validar';
  nomeArquivo: string;
  buffer: ArrayBuffer;
};

export type DoWorker =
  | { tipo: 'etapa'; mensagem: string }
  | { tipo: 'resultado'; resultado: ResultadoValidacao }
  | { tipo: 'erro'; mensagem: string };
