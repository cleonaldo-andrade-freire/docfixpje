import { useId, useState } from 'react';
import { LIMITES } from '../config/limites';
import { detectarTipo } from '../deteccao/detectarTipo';
import { formatarTamanho } from '../infra/formato';
import type { ItemArquivo } from '../estado/store';
import css from './AreaUpload.module.css';

/**
 * Área de upload (spec §5, §10.2, §11): input[type=file] real sob a zona de
 * drop. O lote acima do máximo é recusado inteiro, com mensagem clara. Arquivo
 * acima do tamanho absoluto entra já reprovado, sem ler os bytes.
 */

function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function itemReprovadoPorTamanho(file: File): ItemArquivo {
  const excedente = file.size - LIMITES.TAMANHO_ABSOLUTO_LEITURA_BYTES;
  return {
    id: novoId(),
    file,
    tipoRapido: null,
    estado: 'inapto',
    etapa: null,
    resultadoCorrecao: null,
    orientacaoCorrecao: null,
    correcao: null,
    resultado: {
      nomeArquivo: file.name,
      tipoDetectado: null,
      tamanhoBytes: file.size,
      pdfaParte: null,
      pdfaConformidade: null,
      apto: false,
      corrigivel: false,
      ocorrencias: [
        {
          codigo: 'TAMANHO_EXCEDIDO',
          gravidade: 'erro',
          mensagem: `O arquivo tem ${formatarTamanho(file.size)} — ${formatarTamanho(excedente)} acima do teto de ${formatarTamanho(LIMITES.TAMANHO_ABSOLUTO_LEITURA_BYTES)}. É grande demais para processar no navegador.`,
          detalheTecnico: `${file.size} bytes; acima do teto absoluto de leitura (${LIMITES.TAMANHO_ABSOLUTO_LEITURA_BYTES} bytes)`,
          orientacao: 'Divida o arquivo em partes menores antes de enviar.',
          correcaoDisponivel: null,
        },
      ],
    },
  };
}

async function montarItem(file: File): Promise<ItemArquivo> {
  if (file.size > LIMITES.TAMANHO_ABSOLUTO_LEITURA_BYTES) {
    return itemReprovadoPorTamanho(file);
  }
  const cabecalho = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  return {
    id: novoId(),
    file,
    tipoRapido: detectarTipo(cabecalho),
    estado: 'aguardando',
    etapa: null,
    resultado: null,
    resultadoCorrecao: null,
    orientacaoCorrecao: null,
    correcao: null,
  };
}

export function AreaUpload({
  totalAtual,
  onArquivos,
  onRecusa,
}: {
  totalAtual: number;
  onArquivos: (itens: ItemArquivo[]) => void;
  onRecusa: (motivo: string) => void;
}) {
  const [arrastando, setArrastando] = useState(false);
  const ajudaId = useId();

  async function receber(lista: FileList | null) {
    const arquivos = lista ? Array.from(lista) : [];
    if (arquivos.length === 0) return;

    if (totalAtual + arquivos.length > LIMITES.MAX_ARQUIVOS_LOTE) {
      onRecusa(
        `Máximo de ${LIMITES.MAX_ARQUIVOS_LOTE} arquivos por vez. Remova alguns da lista e tente de novo.`,
      );
      return;
    }
    const itens = await Promise.all(arquivos.map(montarItem));
    onArquivos(itens);
  }

  return (
    <div
      className={`${css.raiz} ${arrastando ? css.arrastando : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        void receber(e.dataTransfer.files);
      }}
    >
      <svg
        className={css.icone}
        viewBox="0 0 24 24"
        width="28"
        height="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 15V3" />
        <path d="M8 7l4-4 4 4" />
        <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      </svg>
      <p className={css.titulo}>Arraste os arquivos aqui ou clique para escolher</p>
      <p className={css.ajuda} id={ajudaId}>
        PDF, MP3 ou MP4. Nada é enviado para nenhum servidor.
      </p>
      <input
        type="file"
        multiple
        className={css.input}
        aria-label="Selecionar arquivos para validar"
        aria-describedby={ajudaId}
        onChange={(e) => {
          void receber(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
