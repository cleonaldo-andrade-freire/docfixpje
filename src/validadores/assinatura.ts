import type { Ocorrencia } from '../tipos';
import type { ContextoArquivo } from './contexto';

/**
 * Regra 1 — o arquivo não pode possuir assinatura digital (spec §7.1).
 * Aplica-se só a PDF. A varredura bruta do trailer é a fonte da verdade.
 *
 * Nota de reconciliação (spec §7.1 x §14.1): "SigFlags ≠ 0 → reprovado" e
 * "campo vazio → aviso" entram em conflito para um PDF só com campo preparado.
 * Aqui, `ASSINATURA_PRESENTE` (erro) exige evidência real de assinatura:
 * `/V` preenchido, ou `/ByteRange`+`/Contents`, ou `/Perms` com `/DocMDP`/`/UR3`,
 * ou `SigFlags` com o bit AppendOnly (valor 2 ou 3). Campo `/FT /Sig` sem nada
 * disso vira `CAMPO_ASSINATURA_VAZIO` (aviso), mantendo o arquivo apto.
 */
export function validarAssinatura(ctx: ContextoArquivo): Ocorrencia[] {
  if (ctx.pdf === null) return []; // MP3/MP4 não carregam PAdES/CAdES

  const t = ctx.pdf.trailer;
  const oc: Ocorrencia[] = [];

  const bitAppendOnly = t.sigFlags !== null && (t.sigFlags & 2) !== 0;
  const evidenciaReal =
    t.temByteRangeEContents || t.camposSigComV > 0 || t.temDocMDP || t.temUR3 || bitAppendOnly;

  if (evidenciaReal) {
    const qtd = Math.max(t.camposSigComV, t.nomesCamposSig.length, 1);
    const campos = t.nomesCamposSig.length ? t.nomesCamposSig.join(', ') : '(sem nome)';
    oc.push({
      codigo: 'ASSINATURA_PRESENTE',
      gravidade: 'erro',
      mensagem: `O documento contém ${qtd} assinatura${qtd > 1 ? 's' : ''} digital${qtd > 1 ? 'is' : ''}.`,
      detalheTecnico:
        `AcroForm.SigFlags=${t.sigFlags ?? '(ausente)'}; ` +
        `campos /FT /Sig: ${campos}` +
        (t.temByteRangeEContents ? '; dicionário de assinatura com /ByteRange e /Contents' : ''),
      orientacao:
        'A correção automática reescreve o PDF sem a camada de assinatura, ' +
        'preservando o texto. A autenticidade destes documentos costuma ser ' +
        'conferida pelo código impresso na página, não pela assinatura embarcada.',
      correcaoDisponivel: 'REMOVER_ASSINATURA',
    });

    if (t.temDocMDP || t.temUR3) {
      oc.push({
        codigo: 'RESTRICAO_DOCMDP',
        gravidade: 'erro',
        mensagem: 'O documento tem uma assinatura de certificação que restringe alterações.',
        detalheTecnico: `/Perms com ${[t.temDocMDP && '/DocMDP', t.temUR3 && '/UR3'].filter(Boolean).join(' e ')}`,
        orientacao: 'A remoção da assinatura também remove essa restrição.',
        correcaoDisponivel: 'REMOVER_ASSINATURA',
      });
    }
    return oc;
  }

  const campoPreparado =
    t.nomesCamposSig.length > 0 || (t.sigFlags !== null && t.sigFlags !== 0);
  if (campoPreparado) {
    const campos = t.nomesCamposSig.length ? t.nomesCamposSig.join(', ') : '(sem nome)';
    oc.push({
      codigo: 'CAMPO_ASSINATURA_VAZIO',
      gravidade: 'aviso',
      mensagem: 'O documento tem um campo de assinatura preparado, mas não preenchido.',
      detalheTecnico: `campo(s) /FT /Sig sem /V: ${campos}; SigFlags=${t.sigFlags ?? '(ausente)'}`,
      orientacao:
        'Em geral o PJe aceita. Se recusar, reimprima o PDF pelo navegador ' +
        '(Ctrl+P → "Salvar como PDF") para remover o campo.',
      correcaoDisponivel: null,
    });
  }
  return oc;
}
