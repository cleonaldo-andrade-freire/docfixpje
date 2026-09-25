import type { Ocorrencia } from '../tipos';
import type { ContextoArquivo } from './contexto';
import type { PermissoesPdf } from '../pdf/estrutura';

/**
 * Regra 1b — o PDF não pode proibir a própria assinatura.
 *
 * Um PDF cifrado só com senha de dono abre normalmente e passa em tudo mais,
 * mas o dicionário de criptografia carrega em /P os bits de permissão. Assinar
 * é, na prática, três operações: criar um campo /FT /Sig (bit 9), pendurar um
 * widget de anotação (bit 6) e gravar um incremental update (bits 4 e 11).
 * Negado qualquer um deles, o assinador do PJe (PJeOffice / Shodô) aborta —
 * mesmo que o arquivo abra sem pedir senha e o tribunal nem exija PDF/A.
 *
 * Caso real que motivou a regra: certidão de inteiro teor do ONR, AES-256 com
 * /P -1340 (só impressão liberada). Passava como apta e o PJe recusava na hora
 * de assinar, sem mensagem que ajudasse.
 *
 * O `PDFA_CRIPTOGRAFADO` de `pdfaEstrutura` continua existindo para o caso de
 * cifra que NÃO bloqueia assinatura (atrapalha só o PDF/A). Quando esta regra
 * dispara, ela suprime aquele aviso para não dizer a mesma coisa duas vezes.
 */

/** As permissões que uma assinatura digital exige. */
export function bloqueiaAssinatura(p: PermissoesPdf | null): boolean {
  if (p === null) return false;
  return !p.modificarConteudo || !p.anotar || !p.preencherFormulario || !p.montarDocumento;
}

const ROTULOS: ReadonlyArray<[keyof PermissoesPdf, string, number]> = [
  ['modificarConteudo', 'alterar o conteúdo', 4],
  ['anotar', 'criar anotações', 6],
  ['preencherFormulario', 'preencher campos de formulário', 9],
  ['montarDocumento', 'montar o documento', 11],
];

export function validarCriptografia(ctx: ContextoArquivo): Ocorrencia[] {
  if (ctx.pdf === null) return [];
  const cripto = ctx.pdf.cripto;
  if (cripto === null) return [];
  if (!bloqueiaAssinatura(cripto.permissoes)) return [];

  const p = cripto.permissoes!;
  const negadas = ROTULOS.filter(([chave]) => !p[chave]).map(([, rotulo, bit]) => `${rotulo} (bit ${bit})`);
  const algoritmo = [cripto.metodo, cripto.v !== null ? `V=${cripto.v}` : null, cripto.r !== null ? `R=${cripto.r}` : null]
    .filter(Boolean)
    .join(', ');

  return [
    {
      codigo: 'PDF_ASSINATURA_BLOQUEADA',
      gravidade: 'erro',
      mensagem: 'O PDF tem proteção que proíbe assiná-lo digitalmente.',
      detalheTecnico:
        `dicionário /Encrypt${algoritmo ? ` (${algoritmo})` : ''} com /P ${p.p}; ` +
        `permissões negadas: ${negadas.join(', ')}`,
      orientacao:
        'O arquivo abre normalmente, mas o PJe não consegue assiná-lo: a proteção ' +
        'nega justamente as operações que uma assinatura faz. A correção automática ' +
        'reescreve o PDF sem a proteção, preservando o texto e as páginas.',
      correcaoDisponivel: 'REMOVER_CRIPTOGRAFIA',
    },
  ];
}
