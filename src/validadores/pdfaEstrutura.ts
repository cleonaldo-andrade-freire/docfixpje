import type { Ocorrencia, Gravidade } from '../tipos';
import type { ContextoArquivo } from './contexto';
import { varrerEstruturaPdfa } from '../pdf/estrutura';

/**
 * Regra 3 nível 2 — verificações estruturais (spec §7.3). Rodam sempre que for
 * PDF e `pdfaObrigatorio`, mesmo com declaração presente, para pegar declaração
 * falsa. Heurística por varredura de bytes, não auditoria ISO 19005 (spec §15).
 *
 * A gravidade segue `config.pdfa.pdfaGravidade`. Se houver declaração PDF/A e
 * qualquer verificação falhar, emite também `PDFA_DECLARACAO_INCONSISTENTE`.
 */
export function validarPdfaEstrutura(ctx: ContextoArquivo): Ocorrencia[] {
  if (ctx.pdf === null) return [];
  if (!ctx.config.pdfa.pdfaObrigatorio) return [];

  const g: Gravidade = ctx.config.pdfa.pdfaGravidade;
  const parte = ctx.pdf.pdfaId?.parte ?? null;
  const declarado = ctx.pdf.pdfaId !== null;
  const e = varrerEstruturaPdfa(ctx.bytes);
  const oc: Ocorrencia[] = [];

  const add = (codigo: Ocorrencia['codigo'], mensagem: string, detalheTecnico: string) => {
    oc.push({
      codigo,
      gravidade: g,
      mensagem,
      detalheTecnico,
      orientacao: 'A correção automática converte para PDF/A-2b e embute o que falta.',
      correcaoDisponivel: 'CONVERTER_PDFA',
    });
  };

  if (ctx.pdf.trailer.temEncrypt) {
    add('PDFA_CRIPTOGRAFADO', 'O PDF está criptografado, o que impede a conformidade PDF/A.', 'trailer com /Encrypt');
  }
  if (!e.temOutputIntentPdfa) {
    add('PDFA_SEM_OUTPUTINTENT', 'O PDF não tem um perfil de cor de saída (OutputIntent) PDF/A.', 'sem /OutputIntents com subtipo /GTS_PDFA1');
  }
  if (e.fonteNaoEmbutida) {
    add('PDFA_FONTE_NAO_EMBUTIDA', 'O PDF usa fonte não embutida.', '/FontDescriptor sem /FontFile, /FontFile2 ou /FontFile3');
  }
  if (e.temJavaScript) {
    add('PDFA_JAVASCRIPT', 'O PDF contém JavaScript, proibido em PDF/A.', '/JavaScript, /JS, /AA ou /OpenAction com script');
  }
  if (e.temEmbeddedFiles) {
    const grav: Gravidade = parte === 3 ? 'aviso' : g;
    oc.push({
      codigo: 'PDFA_ARQUIVO_EMBUTIDO',
      gravidade: grav,
      mensagem: 'O PDF contém arquivos embutidos.',
      detalheTecnico: `/EmbeddedFiles presente (parte declarada: ${parte ?? 'nenhuma'})`,
      orientacao: 'A correção automática converte para PDF/A-2b, removendo os anexos.',
      correcaoDisponivel: 'CONVERTER_PDFA',
    });
  }
  if (e.temTransparencia && (parte === 1 || parte === null)) {
    add('PDFA_TRANSPARENCIA', 'O PDF usa transparência, proibida em PDF/A-1.', '/SMask, /ca ou /CA < 1, ou /Group /S /Transparency');
  }
  if (e.temReferenciaExterna) {
    add('PDFA_REFERENCIA_EXTERNA', 'O PDF referencia recursos externos.', '/Launch ou /GoToR');
  }

  if (declarado && oc.length > 0 && !oc.some((o) => o.codigo === 'PDFA_DECLARACAO_INCONSISTENTE')) {
    oc.push({
      codigo: 'PDFA_DECLARACAO_INCONSISTENTE',
      gravidade: g,
      mensagem: 'O PDF declara PDF/A mas viola a norma nas verificações básicas.',
      detalheTecnico: `declara PDF/A-${parte}; falhas: ${oc.map((o) => o.codigo).join(', ')}`,
      orientacao: 'Não confie na declaração. A correção automática regenera o PDF/A.',
      correcaoDisponivel: 'CONVERTER_PDFA',
    });
  }

  return oc;
}
