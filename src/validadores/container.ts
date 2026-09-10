import type { Ocorrencia } from '../tipos';
import type { ContextoArquivo } from './contexto';

/**
 * Regra 4 — o vídeo tem de ser MP4 ISO de verdade, não QuickTime.
 *
 * Celulares, câmeras e o QuickTime da Apple gravam um container QuickTime e
 * salvam com a extensão .mp4. O arquivo toca em qualquer player, o que faz o
 * usuário jurar que está tudo certo, mas o demuxer do PJe recusa na hora de
 * anexar. Como as amostras já são H.264/AAC, a correção é um remux — trocar o
 * container sem tocar na mídia (ver `midia/remuxarMp4.ts`).
 */
export function validarContainer(ctx: ContextoArquivo): Ocorrencia[] {
  const midia = ctx.midia;
  if (!midia) return [];

  if (!midia.remuxavel) {
    return [
      {
        codigo: 'MIDIA_NAO_REMUXAVEL',
        gravidade: 'erro',
        mensagem: 'O vídeo não está num formato que o PJe aceite, e a conversão automática não dá conta dele.',
        detalheTecnico: midia.motivo ?? 'estrutura de container não suportada',
        orientacao:
          'Recodifique o vídeo para MP4 (H.264 + AAC) num conversor de vídeo e valide o arquivo gerado.',
        correcaoDisponivel: null,
      },
    ];
  }

  if (midia.problemas.length === 0) return [];

  const quicktime = midia.container === 'quicktime';
  const trilhas = midia.trilhas.map((t) => `${t.midia}/${t.codec || '?'}`).join(', ');

  return [
    {
      codigo: 'CONTAINER_QUICKTIME',
      gravidade: 'erro',
      mensagem: quicktime
        ? 'O arquivo tem extensão .mp4, mas por dentro é um vídeo QuickTime (.mov) — é por isso que o PJe recusa o anexo.'
        : 'O arquivo é MP4, mas carrega estruturas do QuickTime que o PJe não interpreta.',
      detalheTecnico: `${midia.problemas.join('; ')} | trilhas: ${trilhas}`,
      orientacao:
        'A correção automática troca o container para MP4 sem recodificar: a imagem e o som ' +
        'saem idênticos, byte a byte, e o arquivo continua com a mesma duração e qualidade.',
      correcaoDisponivel: 'REMUXAR_MP4',
    },
  ];
}
