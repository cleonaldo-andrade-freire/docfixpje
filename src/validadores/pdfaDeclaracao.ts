import type { Ocorrencia } from '../tipos';
import type { ContextoArquivo } from './contexto';

/**
 * Regra 3 nível 1 — declaração PDF/A no XMP (spec §7.3).
 * A gravidade de toda a Regra 3 segue `config.pdfa.pdfaGravidade` (padrão 'aviso'):
 * muitos tribunais aceitam PDF comum, e cravar 'erro' treinaria o usuário a
 * ignorar o diagnóstico.
 */
export function validarPdfaDeclaracao(ctx: ContextoArquivo): Ocorrencia[] {
  if (ctx.pdf === null) return [];
  if (!ctx.config.pdfa.pdfaObrigatorio) return [];

  const g = ctx.config.pdfa.pdfaGravidade;
  const pdfaId = ctx.pdf.pdfaId;

  if (pdfaId === null) {
    return [
      {
        codigo: 'PDFA_NAO_DECLARADO',
        gravidade: g,
        mensagem: 'O PDF não declara conformidade PDF/A nos metadados.',
        detalheTecnico: 'sem pdfaid:part / pdfaid:conformance no XMP (namespace aiim.org/pdfa/ns/id/)',
        orientacao:
          'Se o seu tribunal exigir PDF/A, exporte o documento como PDF/A pelo ' +
          'LibreOffice (Arquivo → Exportar como PDF → PDF/A). A correção automática ' +
          'também converte para PDF/A-2b.',
        correcaoDisponivel: 'CONVERTER_PDFA',
      },
    ];
  }

  if (!ctx.config.pdfa.pdfaPartesAceitas.includes(pdfaId.parte)) {
    return [
      {
        codigo: 'PDFA_DECLARACAO_INCONSISTENTE',
        gravidade: g,
        mensagem: `O PDF declara PDF/A parte ${pdfaId.parte}, fora da lista aceita.`,
        detalheTecnico: `pdfaid:part=${pdfaId.parte}; aceitas: ${ctx.config.pdfa.pdfaPartesAceitas.join(', ')}`,
        orientacao: 'A correção automática converte para PDF/A-2b.',
        correcaoDisponivel: 'CONVERTER_PDFA',
      },
    ];
  }

  return [];
}
