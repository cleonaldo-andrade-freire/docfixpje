import type { Ocorrencia, ResultadoCorrecao, RevalidacaoCorrecao } from '../tipos';
import type { ConfigValidacao } from '../validadores/contexto';
import { COMPRESSAO_TENTATIVAS, DPI_AVISO_RESOLUCAO, LIMITES, type NivelCompressao } from '../config/limites';
import type { MotorPdf } from './motor';
import {
  argumentosGs,
  estrategiasDe,
  exigeTextoPreservado,
  type EstrategiaReescrita,
} from './argumentosGs';
import { revalidar } from './revalidar';
import { textoPreservado } from './preservacaoTexto';
import { nomeCorrigido } from './nomeCorrigido';

export { nomeCorrigido };

/**
 * Correção de PDF. Tenta as estratégias de reescrita em ordem, da mais fiel
 * para a mais agressiva, até o arquivo de saída revalidar:
 *   fiel → PDF/A → comprimir (só se acima do limite) → rasterizar (só assinado).
 * Assim um PDF assinado é SEMPRE corrigido, sem intervenção do usuário e sem
 * perder qualidade quando não precisa.
 *
 * `sucesso` é SEMPRE função de `revalidacao.apto` (e, quando a estratégia exige,
 * de `textoPreservado`), NUNCA do código de retorno do motor (spec §8.3.2).
 */

export interface ProgressoCorrecao {
  (etapa: string): void;
}

const NIVEL_FIEL: NivelCompressao = { rotulo: 'fiel', pdfsettings: '/ebook', dpi: null };

interface TentativaEstrategia {
  saida: Uint8Array | null;
  estrategia: EstrategiaReescrita;
  comprimiu: boolean;
  reduziuResolucao: boolean;
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

  const estrategias: EstrategiaReescrita[] = [
    'fiel',
    'pdfa',
    ...(precisaComprimir ? (['comprimir'] as const) : []),
    ...(ehAssinado ? (['rasterizado'] as const) : []),
  ];

  const falha = (avisos: string[], tamanhoDepois: number, reval: RevalidacaoCorrecao) => ({
    bytesCorrigidos: null,
    resultado: {
      tentada: true,
      estrategias: estrategiasDe({ ocorrencias, comprimiu: precisaComprimir, converteuPdfa: false }),
      sucesso: false,
      tamanhoAntes,
      tamanhoDepois,
      textoPreservado: false,
      avisos,
      duracaoMs: Date.now() - inicio,
      revalidacao: reval,
    } satisfies ResultadoCorrecao,
  });

  let menorGeral = Number.POSITIVE_INFINITY;
  let ultimaRevalidacao: RevalidacaoCorrecao = { apto: false, ocorrencias: [] };

  for (const estrategia of estrategias) {
    const tentativa = await rodarEstrategia({ estrategia, bytes, motor, precisaComprimir, ehAssinado, onEtapa });
    menorGeral = Math.min(menorGeral, tentativa.menorTamanho);
    if (!tentativa.saida) continue;

    onEtapa('Revalidando o arquivo corrigido…');
    const revalidacao = await revalidar(nomeCorrigido(nomeArquivo), tentativa.saida, config);
    ultimaRevalidacao = revalidacao;

    const precisaTexto = ehAssinado && exigeTextoPreservado(estrategia);
    const preservacao = precisaTexto
      ? textoPreservado(bytes, tentativa.saida)
      : { preservado: true, similaridade: 1 };

    if (!revalidacao.apto || (precisaTexto && !preservacao.preservado)) continue;

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
        estrategias: estrategiasDe({
          ocorrencias,
          comprimiu: tentativa.comprimiu,
          converteuPdfa: estrategia === 'pdfa',
        }),
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

  if (precisaComprimir && Number.isFinite(menorGeral) && menorGeral > LIMITES.TAMANHO_MAX_BYTES) {
    return falha(
      [
        `Menor tamanho alcançado: ${menorGeral} bytes, ainda acima do limite. Considere dividir o documento em partes.`,
      ],
      menorGeral,
      ultimaRevalidacao,
    );
  }
  return falha(
    ['Não foi possível gerar um arquivo válido. Siga a orientação manual abaixo.'],
    tamanhoAntes,
    ultimaRevalidacao,
  );
}

/** Roda uma estratégia (com laço de compressão quando `estrategia === 'comprimir'`). */
async function rodarEstrategia(p: {
  estrategia: EstrategiaReescrita;
  bytes: Uint8Array;
  motor: MotorPdf;
  precisaComprimir: boolean;
  ehAssinado: boolean;
  onEtapa: ProgressoCorrecao;
}): Promise<TentativaEstrategia> {
  const { estrategia, bytes, motor, precisaComprimir, ehAssinado, onEtapa } = p;
  const niveis: readonly NivelCompressao[] =
    estrategia === 'comprimir' ? COMPRESSAO_TENTATIVAS : [NIVEL_FIEL];

  let menorTamanho = Number.POSITIVE_INFINITY;
  let reduziuResolucao = false;

  for (let k = 0; k < niveis.length; k++) {
    const nivel = niveis[k]!;
    if (estrategia === 'comprimir') {
      onEtapa(`Comprimindo — tentativa ${k + 1} de ${niveis.length}…`);
    } else if (estrategia === 'rasterizado') {
      onEtapa('Removendo a assinatura (convertendo páginas em imagem)…');
    } else if (ehAssinado) {
      onEtapa('Removendo a assinatura…');
    } else {
      onEtapa('Reescrevendo o PDF…');
    }
    if (estrategia === 'pdfa') onEtapa('Convertendo para PDF/A…');

    const r = await motor.executar(bytes, argumentosGs({ estrategia, nivel }));
    if (r.codigo !== 0 || !r.bytes || r.bytes.length === 0) continue;
    menorTamanho = Math.min(menorTamanho, r.bytes.length);
    reduziuResolucao = nivel.dpi !== null && nivel.dpi <= DPI_AVISO_RESOLUCAO;

    if (!precisaComprimir || r.bytes.length <= LIMITES.TAMANHO_MAX_BYTES) {
      return { saida: r.bytes, estrategia, comprimiu: estrategia === 'comprimir', reduziuResolucao, menorTamanho };
    }
  }
  return { saida: null, estrategia, comprimiu: estrategia === 'comprimir', reduziuResolucao, menorTamanho };
}
