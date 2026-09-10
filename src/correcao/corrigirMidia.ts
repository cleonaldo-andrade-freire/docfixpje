import type { ResultadoCorrecao } from '../tipos';
import type { ConfigValidacao } from '../validadores/contexto';
import { remuxarParaMp4 } from '../midia/remuxarMp4';
import { revalidar } from './revalidar';
import { saidaCorrigida } from './nomeCorrigido';

/**
 * Correção de vídeo: remux QuickTime → MP4 ISO, sem recodificar.
 *
 * Não há motor externo aqui — o remux é aritmética de offsets mais uma cópia
 * das amostras, então roda em segundos mesmo num arquivo de centenas de MB e
 * não puxa o Ghostscript para dentro deste caminho.
 *
 * Como em `corrigirPdf`, `sucesso` é SEMPRE função de `revalidacao.apto`
 * (spec §8.3.2, `correcao-honesta.md`): se o arquivo remuxado não passar pelos
 * mesmos validadores do zero, a correção falhou — ainda que o remux em si tenha
 * terminado sem erro. É o que acontece, por exemplo, com um vídeo QuickTime
 * acima do teto de tamanho: o container fica certo, o tamanho continua errado.
 */
export async function corrigirMidia(params: {
  nomeArquivo: string;
  bytes: Uint8Array;
  config?: ConfigValidacao;
  onEtapa?: (etapa: string) => void;
}): Promise<{ resultado: ResultadoCorrecao; bytesCorrigidos: Uint8Array | null }> {
  const { nomeArquivo, bytes, config } = params;
  const onEtapa = params.onEtapa ?? (() => {});
  const inicio = Date.now();
  const tamanhoAntes = bytes.length;

  const base = {
    tentada: true,
    estrategias: ['REMUXAR_MP4'],
    tamanhoAntes,
    textoPreservado: true,
    duracaoMs: 0,
  } as const;

  onEtapa('Convertendo o vídeo para MP4 (sem recodificar)…');
  const remux = remuxarParaMp4(bytes);

  if (!remux.ok) {
    return {
      bytesCorrigidos: null,
      resultado: {
        ...base,
        estrategias: ['REMUXAR_MP4'],
        sucesso: false,
        tamanhoDepois: tamanhoAntes,
        avisos: [`Não foi possível converter o vídeo: ${remux.motivo}`],
        duracaoMs: Date.now() - inicio,
        revalidacao: { apto: false, ocorrencias: [] },
      },
    };
  }

  onEtapa('Revalidando o arquivo corrigido…');
  const revalidacao = await revalidar(saidaCorrigida(nomeArquivo, 'video/mp4').nome, remux.bytes, config);

  if (!revalidacao.apto) {
    return {
      bytesCorrigidos: null,
      resultado: {
        ...base,
        estrategias: ['REMUXAR_MP4'],
        sucesso: false,
        tamanhoDepois: remux.bytes.length,
        avisos: ['O vídeo convertido ainda não passa na validação. Siga a orientação manual abaixo.'],
        duracaoMs: Date.now() - inicio,
        revalidacao,
      },
    };
  }

  return {
    bytesCorrigidos: remux.bytes,
    resultado: {
      ...base,
      estrategias: ['REMUXAR_MP4'],
      sucesso: true,
      tamanhoDepois: remux.bytes.length,
      avisos: [
        'A imagem e o som foram copiados sem recodificar — a qualidade é idêntica à do arquivo original.',
      ],
      duracaoMs: Date.now() - inicio,
      revalidacao,
    },
  };
}
