import type { Ocorrencia, CodigoOcorrencia } from '../tipos';

/**
 * Orientação de correção manual, textual (spec §5 fase 1, §7.4).
 *
 * Caso especial §7.4: quando o arquivo falha na Regra 1 (assinatura) E na
 * Regra 3 (PDF/A) ao mesmo tempo, NÃO exibir as duas orientações soltas — o
 * usuário entra em loop entre os dois erros. Exibir um único fluxo encadeado
 * de dois passos.
 */

export interface PassoManual {
  titulo: string;
  detalhe: string;
}

export interface OrientacaoManual {
  resumo: string;
  passos: PassoManual[];
}

const PDFA_CODIGOS = new Set<CodigoOcorrencia>([
  'PDFA_NAO_DECLARADO',
  'PDFA_DECLARACAO_INCONSISTENTE',
  'PDFA_SEM_OUTPUTINTENT',
  'PDFA_FONTE_NAO_EMBUTIDA',
  'PDFA_JAVASCRIPT',
  'PDFA_ARQUIVO_EMBUTIDO',
  'PDFA_TRANSPARENCIA',
  'PDFA_REFERENCIA_EXTERNA',
]);

export function montarOrientacaoManual(ocorrencias: Ocorrencia[]): OrientacaoManual[] {
  const codigos = new Set(ocorrencias.map((o) => o.codigo));

  const temAssinatura = codigos.has('ASSINATURA_PRESENTE') || codigos.has('RESTRICAO_DOCMDP');
  const temPdfa = [...codigos].some((c) => PDFA_CODIGOS.has(c));

  // §7.4 — fluxo encadeado
  if (temAssinatura && temPdfa) {
    return [
      {
        resumo:
          'Este arquivo tem assinatura digital e não está em PDF/A. Resolva os dois numa sequência só, para não entrar em loop:',
        passos: [
          {
            titulo: '1. Remova a assinatura reimprimindo o PDF',
            detalhe:
              'Abra o arquivo no navegador, use Ctrl+P e escolha "Salvar como PDF" / "Microsoft Print to PDF". Isso descarta a camada de assinatura.',
          },
          {
            titulo: '2. Converta o resultado para PDF/A',
            detalhe:
              'Abra o PDF reimpresso no LibreOffice e use Arquivo → Exportar como PDF → marque "PDF/A-2b". Anexe esse último arquivo ao PJe.',
          },
        ],
      },
    ];
  }

  const out: OrientacaoManual[] = [];

  if (temAssinatura) {
    out.push({
      resumo: 'Remova a assinatura digital embarcada:',
      passos: [
        {
          titulo: 'Reimprima o PDF pelo navegador',
          detalhe:
            'Abra o arquivo no Chrome ou Firefox, use Ctrl+P e escolha "Salvar como PDF". O arquivo gerado não tem mais a assinatura.',
        },
      ],
    });
  }

  if (temPdfa) {
    out.push({
      resumo: 'Converta para PDF/A:',
      passos: [
        {
          titulo: 'Exporte como PDF/A pelo LibreOffice',
          detalhe:
            'Abra o documento no LibreOffice e use Arquivo → Exportar como PDF → marque "PDF/A-2b".',
        },
      ],
    });
  }

  if (codigos.has('TAMANHO_EXCEDIDO')) {
    out.push({
      resumo: 'Reduza o tamanho do arquivo:',
      passos: [
        {
          titulo: 'Comprima ou divida o documento',
          detalhe:
            'Para PDF, use um compressor (ex.: "Reduzir tamanho" do LibreOffice) ou divida em partes menores. Para mídia, recodifique com bitrate menor.',
        },
      ],
    });
  }

  if (codigos.has('ARQUIVO_CRIPTOGRAFADO')) {
    out.push({
      resumo: 'O arquivo está protegido por senha:',
      passos: [
        {
          titulo: 'Remova a proteção na origem',
          detalhe:
            'Abra o PDF com a senha no aplicativo que o gerou e salve uma cópia sem proteção. Esta ferramenta não pede senha nem quebra proteção.',
        },
      ],
    });
  }

  return out;
}
