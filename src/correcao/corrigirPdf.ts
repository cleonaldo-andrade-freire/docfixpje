import type { Ocorrencia, ResultadoCorrecao, RevalidacaoCorrecao } from '../tipos';
import type { ConfigValidacao } from '../validadores/contexto';
import { COMPRESSAO_TENTATIVAS, DPI_AVISO_RESOLUCAO, LIMITES } from '../config/limites';
import type { MotorPdf } from './motor';
import {
  argumentosGs,
  estrategiasDe,
  exigeTextoPreservado,
  ESTRATEGIAS_REESCRITA,
  type EstrategiaReescrita,
} from './argumentosGs';
import { revalidar } from './revalidar';
import { textoPreservado } from './preservacaoTexto';
import { nomeCorrigido } from './nomeCorrigido';

export { nomeCorrigido };

/**
 * Correção de PDF. Tenta as estratégias de reescrita em ordem
 * (PDF/A → limpa → rasterizada) até o arquivo de saída revalidar. Assim um PDF
 * assinado — o erro mais comum — SEMPRE é corrigido, de forma automática e
 * transparente (spec §8.2 fallback, sem intervenção do usuário).
 *
 * `sucesso` é SEMPRE função de `revalidacao.apto` (e, quando a estratégia exige,
 * de `textoPreservado`), NUNCA do código de retorno do motor (spec §8.3.2).
 */

export interface ProgressoCorrecao {
  (etapa: string): void;
}

interface TentativaEstrategia {
  /** null quando o motor não produziu nada que coubesse no limite. */
  saida: Uint8Array | null;
  estrategia: EstrategiaReescrita;
  comprimiu: boolean;
  reduziuResolucao: boolean;
  /** Menor saída obtida (mesmo que acima do limite). */
  menorTamanho: number;
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
  const tamanhoAntes = bytes.length;

  const ehAssinado = ocorrencias.some(
    (o) => o.codigo === 'ASSINATURA_PRESENTE' || o.codigo === 'RESTRICAO_DOCMDP',
  );
  const precisaComprimir =
    bytes.length > LIMITES.TAMANHO_MAX_BYTES ||
    ocorrencias.some((o) => o.codigo === 'TAMANHO_EXCEDIDO');

  const niveis = precisaComprimir ? COMPRESSAO_TENTATIVAS : [COMPRESSAO_TENTATIVAS[0]!];
  // Rasterização só entra como último recurso para remover assinatura.
  const estrategias = ESTRATEGIAS_REESCRITA.filter((e) => e !== 'rasterizado' || ehAssinado);

  const falha = (avisos: string[], tamanhoDepois: number): {
    resultado: ResultadoCorrecao;
    bytesCorrigidos: null;
  } => ({
    bytesCorrigidos: null,
    resultado: {
      tentada: true,
      estrategias: estrategiasDe(ocorrencias, precisaComprimir),
      sucesso: false,
      tamanhoAntes,
      tamanhoDepois,
      textoPreservado: false,
      avisos,
      duracaoMs: Date.now() - inicio,
      revalidacao: { apto: false, ocorrencias: [] },
    },
  });

  let menorGeral = Number.POSITIVE_INFINITY;
  let ultimaRevalidacao: RevalidacaoCorrecao = { apto: false, ocorrencias: [] };

  for (const estrategia of estrategias) {
    const tentativa = await rodarEstrategia({
      estrategia,
      bytes,
      motor,
      niveis,
      precisaComprimir,
      ehAssinado,
      onEtapa,
    });
    menorGeral = Math.min(menorGeral, tentativa.menorTamanho);
    if (!tentativa.saida) continue;

    onEtapa('Revalidando o arquivo corrigido…');
    const revalidacao = await revalidar(nomeCorrigido(nomeArquivo), tentativa.saida, config);
    ultimaRevalidacao = revalidacao;

    const precisaTexto = ehAssinado && exigeTextoPreservado(estrategia);
    const preservacao = precisaTexto
      ? textoPreservado(bytes, tentativa.saida)
      : { preservado: true, similaridade: 1 };

    if (!revalidacao.apto || (precisaTexto && !preservacao.preservado)) {
      continue; // próxima estratégia
    }

    // aceita
    const avisos: string[] = [];
    if (tentativa.reduziuResolucao) {
      avisos.push(
        'A resolução das imagens foi reduzida para caber no limite. Confira a legibilidade antes de protocolar.',
      );
    }
    if (estrategia === 'rasterizado') {
      avisos.push(
        'Para remover a assinatura, as páginas foram convertidas em imagem — o texto deixou de ser selecionável. Confira a legibilidade antes de protocolar.',
      );
    }

    return {
      bytesCorrigidos: tentativa.saida,
      resultado: {
        tentada: true,
        estrategias: estrategiasDe(ocorrencias, tentativa.comprimiu),
        sucesso: true,
        tamanhoAntes,
        tamanhoDepois: tentativa.saida.length,
        textoPreservado: estrategia !== 'rasterizado',
        avisos,
        duracaoMs: Date.now() - inicio,
        revalidacao,
      },
    };
  }

  // Nenhuma estratégia serviu.
  if (precisaComprimir && Number.isFinite(menorGeral) && menorGeral > LIMITES.TAMANHO_MAX_BYTES) {
    return falha(
      [
        `Menor tamanho alcançado: ${menorGeral} bytes, ainda acima do limite. Considere dividir o documento em partes.`,
      ],
      menorGeral,
    );
  }
  const out = falha(
    ['Não foi possível gerar um arquivo válido. Siga a orientação manual abaixo.'],
    tamanhoAntes,
  );
  out.resultado.revalidacao = ultimaRevalidacao;
  return out;
}

/** Roda uma estratégia (com laço de compressão quando `precisaComprimir`). */
async function rodarEstrategia(p: {
  estrategia: EstrategiaReescrita;
  bytes: Uint8Array;
  motor: MotorPdf;
  niveis: readonly (typeof COMPRESSAO_TENTATIVAS)[number][];
  precisaComprimir: boolean;
  ehAssinado: boolean;
  onEtapa: ProgressoCorrecao;
}): Promise<TentativaEstrategia> {
  const { estrategia, bytes, motor, niveis, precisaComprimir, ehAssinado, onEtapa } = p;
  let menorTamanho = Number.POSITIVE_INFINITY;
  let reduziuResolucao = false;

  for (let k = 0; k < niveis.length; k++) {
    const nivel = niveis[k]!;
    if (precisaComprimir) {
      onEtapa(`Comprimindo — tentativa ${k + 1} de ${niveis.length}…`);
    } else if (estrategia === 'rasterizado') {
      onEtapa('Removendo a assinatura (convertendo páginas em imagem)…');
    } else if (ehAssinado) {
      onEtapa('Removendo a assinatura…');
    } else {
      onEtapa('Reescrevendo o PDF…');
    }

    const r = await motor.executar(bytes, argumentosGs({ estrategia, nivel }));
    if (r.codigo !== 0 || !r.bytes || r.bytes.length === 0) continue;
    menorTamanho = Math.min(menorTamanho, r.bytes.length);

    if (!precisaComprimir || r.bytes.length <= LIMITES.TAMANHO_MAX_BYTES) {
      return {
        saida: r.bytes,
        estrategia,
        comprimiu: precisaComprimir,
        reduziuResolucao: nivel.dpi !== null && nivel.dpi <= DPI_AVISO_RESOLUCAO,
        menorTamanho,
      };
    }
    reduziuResolucao = nivel.dpi !== null && nivel.dpi <= DPI_AVISO_RESOLUCAO;
  }
  return { saida: null, estrategia, comprimiu: precisaComprimir, reduziuResolucao, menorTamanho };
}
