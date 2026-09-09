import type { Ocorrencia, ResultadoValidacao, TipoDetectado } from '../tipos';
import { detectarTipo } from '../deteccao/detectarTipo';
import { ehContainerQuickTime, codecMp4Suportado } from '../deteccao/quicktimeMp4';
import { montarContexto, CONFIG_PADRAO, type ConfigValidacao } from './contexto';
import { VALIDADORES } from './registro';
import { validarTamanho } from './tamanho';

export interface OpcoesValidacao {
  /** Chamado antes de cada etapa, com a mensagem literal da spec §6. */
  onEtapa?: (mensagem: string) => void;
  config?: ConfigValidacao;
}

// PDFA_CRIPTOGRAFADO NÃO entra aqui: um PDF com restrições que abre sem senha é
// corrigível (o Ghostscript remove a cifra ao reescrever). Só um arquivo que
// não abre de jeito nenhum (ARQUIVO_CRIPTOGRAFADO) é não corrigível.
const NAO_CORRIGIVEL = new Set(['ARQUIVO_CRIPTOGRAFADO', 'ARQUIVO_CORROMPIDO', 'FORMATO_NAO_SUPORTADO']);

export async function validarArquivo(
  nomeArquivo: string,
  bytes: ArrayBuffer | Uint8Array,
  opcoes: OpcoesValidacao = {},
): Promise<ResultadoValidacao> {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const config = opcoes.config ?? CONFIG_PADRAO;
  const etapa = (m: string) => opcoes.onEtapa?.(m);

  etapa('Lendo o arquivo…');
  etapa('Verificando o tipo do arquivo…');

  // Vídeo de iPhone/WhatsApp: extensão .mp4, contêiner QuickTime (ftyp "qt").
  // `detectarTipo` rejeita de propósito (§16.6) e, pior, a heurística de MP3
  // pode dar falso positivo nos metadados binários do moov — por isso este
  // caso é resolvido ANTES de cair no detector genérico.
  const quickTime = ehContainerQuickTime(u8);
  const quickTimeCorrigivel = quickTime && codecMp4Suportado(u8);
  const tipo: TipoDetectado | null = quickTimeCorrigivel ? 'video/mp4' : detectarTipo(u8.subarray(0, 4096));

  const base = (ocorrencias: Ocorrencia[]): ResultadoValidacao => {
    const apto = !ocorrencias.some((o) => o.gravidade === 'erro');
    const corrigivel =
      ocorrencias.some((o) => o.correcaoDisponivel !== null) &&
      !ocorrencias.some((o) => NAO_CORRIGIVEL.has(o.codigo));
    return {
      nomeArquivo,
      tipoDetectado: tipo,
      tamanhoBytes: u8.length,
      pdfaParte: null,
      pdfaConformidade: null,
      apto,
      corrigivel,
      ocorrencias,
    };
  };

  if (tipo === null) {
    return base([
      quickTime
        ? {
            codigo: 'FORMATO_NAO_SUPORTADO',
            gravidade: 'erro',
            mensagem: 'O vídeo usa um codec que não pode ser convertido automaticamente para o formato aceito pelo PJe.',
            detalheTecnico: 'ftyp major brand "qt" (QuickTime), mas o codec em stsd não é avc1/mp4a',
            orientacao: 'Reexporte o vídeo em H.264 (avc1) com áudio AAC, ou recodifique em outro aplicativo antes de enviar.',
            correcaoDisponivel: null,
          }
        : {
            codigo: 'FORMATO_NAO_SUPORTADO',
            gravidade: 'erro',
            mensagem: 'O arquivo não é PDF, MP3 nem MP4 (verificado pelos bytes de cabeçalho).',
            detalheTecnico: 'nenhum magic number reconhecido nos primeiros 4096 bytes',
            orientacao: 'Envie um PDF, MP3 ou MP4. Renomear a extensão não muda o conteúdo.',
            correcaoDisponivel: null,
          },
    ]);
  }

  const ctx = await montarContexto(nomeArquivo, u8, tipo, config);

  // PDF que não abre: cripto ou corrompido. Roda só o validador de tamanho.
  if (ctx.pdf && !ctx.pdf.carga.ok) {
    const motivo = ctx.pdf.carga.motivo;
    const ocPdf: Ocorrencia =
      motivo === 'ARQUIVO_CRIPTOGRAFADO'
        ? {
            codigo: 'ARQUIVO_CRIPTOGRAFADO',
            gravidade: 'erro',
            mensagem: 'O PDF está protegido por senha.',
            detalheTecnico: 'trailer com /Encrypt; pdf-lib recusou a carga',
            orientacao:
              'Remova a proteção por senha no aplicativo que gerou o arquivo e valide de novo. ' +
              'Esta ferramenta não pede senha nem quebra proteção.',
            correcaoDisponivel: null,
          }
        : {
            codigo: 'ARQUIVO_CORROMPIDO',
            gravidade: 'erro',
            mensagem: 'O PDF está corrompido ou incompleto.',
            detalheTecnico: 'pdf-lib não conseguiu interpretar a estrutura do arquivo',
            orientacao: 'Gere o arquivo de novo na origem.',
            correcaoDisponivel: null,
          };
    return base([ocPdf, ...validarTamanho(ctx)]);
  }

  const ocorrencias: Ocorrencia[] = [];
  if (quickTimeCorrigivel) {
    ocorrencias.push({
      codigo: 'MP4_CONTAINER_QUICKTIME',
      gravidade: 'erro',
      mensagem: 'O vídeo está em contêiner QuickTime (comum em iPhone/WhatsApp), não no formato MP4 padrão exigido pelo PJe.',
      detalheTecnico: 'ftyp major brand "qt"; codec avc1/mp4a compatível — só o contêiner precisa ser reescrito',
      orientacao:
        'Corrija automaticamente: o vídeo é reempacotado para MP4 padrão sem recodificar nem perder qualidade.',
      correcaoDisponivel: 'REMUXAR_MP4',
    });
  }
  for (const v of VALIDADORES) {
    if (!v.aplicaA(tipo)) continue;
    etapa(v.etapa);
    ocorrencias.push(...v.executar(ctx));
  }

  const resultado = base(ocorrencias);
  resultado.pdfaParte = ctx.pdf?.pdfaId?.parte ?? null;
  resultado.pdfaConformidade = ctx.pdf?.pdfaId?.conformidade ?? null;
  return resultado;
}
