import type { Ocorrencia, ResultadoCorrecao } from '../tipos';
import type { ConfigValidacao } from '../validadores/contexto';
import { COMPRESSAO_TENTATIVAS, DPI_AVISO_RESOLUCAO, LIMITES } from '../config/limites';
import type { MotorPdf } from './motor';
import { argumentosGs, estrategiasDe } from './argumentosGs';
import { revalidar } from './revalidar';
import { textoPreservado } from './preservacaoTexto';

/**
 * Correção de PDF em UMA passada por tentativa (spec §8.1). Se precisa comprimir,
 * itera os níveis de `COMPRESSAO_TENTATIVAS` e para no primeiro que couber no
 * limite. Cada tentativa = exatamente UMA invocação do motor.
 *
 * `sucesso` é SEMPRE função de `revalidacao.apto` (e, para PDF assinado, de
 * `textoPreservado`), NUNCA do código de retorno do motor (spec §8.3.2,
 * regra `correcao-honesta.md`).
 */

export interface ProgressoCorrecao {
  (etapa: string): void;
}

export async function corrigirPdf(params: {
  nomeArquivo: string;
  bytes: Uint8Array;
  ocorrencias: Ocorrencia[];
  motor: MotorPdf;
  config?: ConfigValidacao;
  onEtapa?: ProgressoCorrecao;
}): Promise<{ resultado: ResultadoCorrecao; bytesCorrigidos: Uint8Array | null }> {
  const { nomeArquivo, bytes, ocorrencias, motor, config } = params;
  const onEtapa = params.onEtapa ?? (() => {});
  const inicio = Date.now();

  const ehAssinado = ocorrencias.some(
    (o) => o.codigo === 'ASSINATURA_PRESENTE' || o.codigo === 'RESTRICAO_DOCMDP',
  );
  const precisaComprimir =
    bytes.length > LIMITES.TAMANHO_MAX_BYTES ||
    ocorrencias.some((o) => o.codigo === 'TAMANHO_EXCEDIDO');

  const niveis = precisaComprimir ? COMPRESSAO_TENTATIVAS : [COMPRESSAO_TENTATIVAS[0]!];
  const avisos: string[] = [];

  let saida: Uint8Array | null = null;
  let nivelUsado = niveis[0]!;
  let menorTamanho = Number.POSITIVE_INFINITY;

  for (let k = 0; k < niveis.length; k++) {
    const nivel = niveis[k]!;
    if (precisaComprimir) {
      onEtapa(`Comprimindo — tentativa ${k + 1} de ${niveis.length}…`);
    } else {
      if (ehAssinado) onEtapa('Removendo a assinatura…');
      onEtapa('Convertendo para PDF/A…');
    }

    const r = await motor.executar(bytes, argumentosGs({ ocorrencias, nivel }));
    if (r.codigo !== 0 || !r.bytes) continue;

    menorTamanho = Math.min(menorTamanho, r.bytes.length);

    if (!precisaComprimir || r.bytes.length <= LIMITES.TAMANHO_MAX_BYTES) {
      saida = r.bytes;
      nivelUsado = nivel;
      break;
    }
  }

  const tamanhoAntes = bytes.length;

  // Compressão esgotou as tentativas sem caber (spec §8.2).
  if (precisaComprimir && saida === null) {
    avisos.push(
      Number.isFinite(menorTamanho)
        ? `Menor tamanho alcançado: ${menorTamanho} bytes, ainda acima do limite. Considere dividir o documento em partes.`
        : 'O motor não conseguiu comprimir o arquivo.',
    );
    return {
      bytesCorrigidos: null,
      resultado: {
        tentada: true,
        estrategias: estrategiasDe(ocorrencias, true),
        sucesso: false,
        tamanhoAntes,
        tamanhoDepois: Number.isFinite(menorTamanho) ? menorTamanho : tamanhoAntes,
        textoPreservado: false,
        avisos,
        duracaoMs: Date.now() - inicio,
        revalidacao: { apto: false, ocorrencias: [] },
      },
    };
  }

  if (saida === null) {
    return {
      bytesCorrigidos: null,
      resultado: {
        tentada: true,
        estrategias: estrategiasDe(ocorrencias, precisaComprimir),
        sucesso: false,
        tamanhoAntes,
        tamanhoDepois: tamanhoAntes,
        textoPreservado: false,
        avisos: ['O motor de correção não produziu um arquivo de saída.'],
        duracaoMs: Date.now() - inicio,
        revalidacao: { apto: false, ocorrencias: [] },
      },
    };
  }

  if (nivelUsado.dpi !== null && nivelUsado.dpi <= DPI_AVISO_RESOLUCAO) {
    avisos.push(
      'A resolução das imagens foi reduzida para caber no limite. Confira a legibilidade antes de protocolar.',
    );
  }

  onEtapa('Revalidando o arquivo corrigido…');
  const nomeSaida = nomeCorrigido(nomeArquivo);
  const revalidacao = await revalidar(nomeSaida, saida, config);
  const preservacao = ehAssinado
    ? textoPreservado(bytes, saida)
    : { preservado: true, similaridade: 1 };

  if (ehAssinado && !preservacao.preservado) {
    avisos.push(
      `O texto do documento não foi preservado (similaridade ${(preservacao.similaridade * 100).toFixed(0)}%). A correção foi descartada.`,
    );
  }

  const sucesso = revalidacao.apto && (!ehAssinado || preservacao.preservado);

  return {
    bytesCorrigidos: sucesso ? saida : null,
    resultado: {
      tentada: true,
      estrategias: estrategiasDe(ocorrencias, precisaComprimir),
      sucesso,
      tamanhoAntes,
      tamanhoDepois: saida.length,
      textoPreservado: preservacao.preservado,
      avisos,
      duracaoMs: Date.now() - inicio,
      revalidacao,
    },
  };
}

/** `documento.pdf` -> `documento-corrigido.pdf` (spec §8.3.4). */
export function nomeCorrigido(nome: string): string {
  const i = nome.lastIndexOf('.');
  return i === -1 ? `${nome}-corrigido` : `${nome.slice(0, i)}-corrigido${nome.slice(i)}`;
}
