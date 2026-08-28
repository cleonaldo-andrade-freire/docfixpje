import type { RevalidacaoCorrecao } from '../tipos';
import { validarArquivo } from '../validadores/validarArquivo';
import type { ConfigValidacao } from '../validadores/contexto';

/**
 * Revalidação OBRIGATÓRIA do arquivo de saída (spec §8.3.1), do zero, pelos
 * mesmos validadores. Sem heurística, sem atalho: passthrough tipado. A regra
 * `correcao-honesta.md` mora aqui — o `sucesso` da correção é função disto.
 */
export async function revalidar(
  nomeSaida: string,
  bytesSaida: Uint8Array,
  config?: ConfigValidacao,
): Promise<RevalidacaoCorrecao> {
  const r = await validarArquivo(nomeSaida, bytesSaida, config ? { config } : {});
  return { apto: r.apto, ocorrencias: r.ocorrencias };
}
