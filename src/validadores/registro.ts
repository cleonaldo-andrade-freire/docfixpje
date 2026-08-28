import type { Ocorrencia, TipoDetectado } from '../tipos';
import type { ContextoArquivo } from './contexto';
import { validarAssinatura } from './assinatura';
import { validarTamanho } from './tamanho';
import { validarPdfaDeclaracao } from './pdfaDeclaracao';
import { validarPdfaEstrutura } from './pdfaEstrutura';

export interface Validador {
  nome: string;
  /** Mensagem de etapa exibida na linha durante a execução (spec §6). */
  etapa: string;
  aplicaA: (tipo: TipoDetectado) => boolean;
  executar: (ctx: ContextoArquivo) => Ocorrencia[];
}

const soPdf = (t: TipoDetectado) => t === 'application/pdf';
const qualquer = () => true;

/**
 * Validadores registrados, na ordem de execução. Funções puras, sem
 * acoplamento com a UI (spec §15).
 */
export const VALIDADORES: readonly Validador[] = [
  {
    nome: 'assinatura',
    etapa: 'Procurando assinatura digital…',
    aplicaA: soPdf,
    executar: validarAssinatura,
  },
  {
    nome: 'pdfaDeclaracao',
    etapa: 'Verificando o formato PDF/A…',
    aplicaA: soPdf,
    executar: validarPdfaDeclaracao,
  },
  {
    nome: 'pdfaEstrutura',
    etapa: 'Verificando o formato PDF/A…',
    aplicaA: soPdf,
    executar: validarPdfaEstrutura,
  },
  {
    nome: 'tamanho',
    etapa: 'Conferindo o tamanho…',
    aplicaA: qualquer,
    executar: validarTamanho,
  },
];
