import type { Ocorrencia, EstrategiaCorrecao } from '../tipos';
import { LIMITES } from '../config/limites';
import type { ContextoArquivo } from './contexto';

/** Regra 2 — o arquivo não pode exceder o limite de tamanho (spec §7.2). */
export function validarTamanho(ctx: ContextoArquivo): Ocorrencia[] {
  if (ctx.tamanhoBytes <= LIMITES.TAMANHO_MAX_BYTES) return [];

  const excedente = ctx.tamanhoBytes - LIMITES.TAMANHO_MAX_BYTES;
  const correcao: EstrategiaCorrecao =
    ctx.tipo === 'application/pdf' ? 'COMPRIMIR_PDF' : 'RECODIFICAR_MIDIA';

  return [
    {
      codigo: 'TAMANHO_EXCEDIDO',
      gravidade: 'erro',
      mensagem: `O arquivo tem ${formatar(ctx.tamanhoBytes)} — ${formatar(excedente)} acima do limite de ${formatar(LIMITES.TAMANHO_MAX_BYTES)}.`,
      detalheTecnico: `${ctx.tamanhoBytes} bytes; limite ${LIMITES.TAMANHO_MAX_BYTES} bytes; excedente ${excedente} bytes`,
      orientacao:
        correcao === 'COMPRIMIR_PDF'
          ? 'A correção automática comprime o PDF por tentativas até caber no limite.'
          : 'A correção automática recodifica a mídia com bitrate menor até caber no limite.',
      correcaoDisponivel: correcao,
    },
  ];
}

function formatar(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2).replace('.', ',')} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(2).replace('.', ',')} KB`;
}
