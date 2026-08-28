import type { Ocorrencia, EstrategiaCorrecao } from '../tipos';
import { LIMITES } from '../config/limites';
import { formatarTamanho } from '../infra/formato';
import type { ContextoArquivo } from './contexto';

/** Regra 2 — o arquivo não pode exceder o limite de tamanho (spec §7.2). */
export function validarTamanho(ctx: ContextoArquivo): Ocorrencia[] {
  if (ctx.tamanhoBytes <= LIMITES.TAMANHO_MAX_BYTES) return [];

  const excedente = ctx.tamanhoBytes - LIMITES.TAMANHO_MAX_BYTES;
  // PDF: compressão automática. MP3/MP4: só orientação textual (decisão P2-1).
  const ehPdf = ctx.tipo === 'application/pdf';
  const correcao: EstrategiaCorrecao | null = ehPdf ? 'COMPRIMIR_PDF' : null;

  return [
    {
      codigo: 'TAMANHO_EXCEDIDO',
      gravidade: 'erro',
      mensagem: `O arquivo tem ${formatarTamanho(ctx.tamanhoBytes)} — ${formatarTamanho(excedente)} acima do limite de ${formatarTamanho(LIMITES.TAMANHO_MAX_BYTES)}.`,
      detalheTecnico: `${ctx.tamanhoBytes} bytes; limite ${LIMITES.TAMANHO_MAX_BYTES} bytes; excedente ${excedente} bytes`,
      orientacao: ehPdf
        ? 'A correção automática comprime o PDF por tentativas até caber no limite.'
        : 'Reduza a duração ou recodifique com bitrate menor no seu editor. A recodificação automática de mídia não está disponível nesta versão.',
      correcaoDisponivel: correcao,
    },
  ];
}
