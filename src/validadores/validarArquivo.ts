import type { Ocorrencia, ResultadoValidacao } from '../tipos';
import { detectarTipo } from '../deteccao/detectarTipo';
import { montarContexto, CONFIG_PADRAO, type ConfigValidacao } from './contexto';
import { VALIDADORES } from './registro';
import { validarTamanho } from './tamanho';

export interface OpcoesValidacao {
  /** Chamado antes de cada etapa, com a mensagem literal da spec §6. */
  onEtapa?: (mensagem: string) => void;
  config?: ConfigValidacao;
}

const NAO_CORRIGIVEL = new Set([
  'ARQUIVO_CRIPTOGRAFADO',
  'ARQUIVO_CORROMPIDO',
  'FORMATO_NAO_SUPORTADO',
  'PDFA_CRIPTOGRAFADO',
]);

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
  const tipo = detectarTipo(u8.subarray(0, 4096));

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
      {
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
