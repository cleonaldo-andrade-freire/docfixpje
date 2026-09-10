import type { Ocorrencia, EstrategiaCorrecao } from '../tipos';
import { LIMITES } from '../config/limites';
import { formatarTamanho } from '../infra/formato';
import { ehMidia, type ContextoArquivo } from './contexto';

/**
 * Regra 2 — o arquivo não pode exceder o limite de tamanho (spec §7.2).
 * PDF: `TAMANHO_MAX_BYTES` (10 MB). MP3/MP4: `TAMANHO_MAX_MIDIA_BYTES` (200 MB).
 */
export function validarTamanho(ctx: ContextoArquivo): Ocorrencia[] {
  const midia = ehMidia(ctx.tipo);
  const limite = midia ? LIMITES.TAMANHO_MAX_MIDIA_BYTES : LIMITES.TAMANHO_MAX_BYTES;

  if (ctx.tamanhoBytes <= limite) return [];

  const excedente = ctx.tamanhoBytes - limite;
  // PDF: compressão automática. MP3/MP4: só orientação textual (decisão P2-1).
  const correcao: EstrategiaCorrecao | null = midia ? null : 'COMPRIMIR_PDF';

  return [
    {
      codigo: 'TAMANHO_EXCEDIDO',
      gravidade: 'erro',
      mensagem: `O arquivo tem ${formatarTamanho(ctx.tamanhoBytes)} — ${formatarTamanho(excedente)} acima do limite de ${formatarTamanho(limite)}.`,
      detalheTecnico: `${ctx.tamanhoBytes} bytes; limite ${limite} bytes; excedente ${excedente} bytes`,
      orientacao: midia
        ? 'Reduza a duração ou recodifique com bitrate menor no seu editor. A recodificação automática de mídia não está disponível nesta versão.'
        : 'A correção automática comprime o PDF por tentativas até caber no limite.',
      correcaoDisponivel: correcao,
    },
  ];
}
