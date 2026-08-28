import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type { ResultadoValidacao, TipoDetectado } from '../tipos';
import { transicionar, type EstadoLinha } from './maquinaLinha';
import { descartar, descartarTudo } from '../infra/blobRegistry';

/**
 * Estado global da aplicação. A lista guarda o objeto `File` (referência
 * preguiçosa ao arquivo em disco), NUNCA o ArrayBuffer (spec §9.3).
 */

export interface ItemArquivo {
  id: string;
  file: File;
  /** Tipo lido dos primeiros bytes ao adicionar. */
  tipoRapido: TipoDetectado | null;
  estado: EstadoLinha;
  etapa: string | null;
  resultado: ResultadoValidacao | null;
  /** Nome do arquivo corrigido, quando houver (Fase 2). */
  correcao: { nome: string; url: string } | null;
}

export interface EstadoStore {
  itens: ItemArquivo[];
  /** Recusa de lote (ex.: acima do máximo). */
  recusa: string | null;
  /** A sessão foi limpa por inatividade. */
  ocioso: boolean;
}

export type AcaoStore =
  | { t: 'adicionar'; itens: ItemArquivo[] }
  | { t: 'recusar'; motivo: string }
  | { t: 'remover'; id: string }
  | { t: 'limparTudo' }
  | { t: 'ociosidadeExpirou' }
  | { t: 'estado'; id: string; estado: EstadoLinha }
  | { t: 'etapa'; id: string; etapa: string }
  | { t: 'resultado'; id: string; resultado: ResultadoValidacao }
  | { t: 'correcao'; id: string; nome: string; url: string };

export const estadoInicial: EstadoStore = { itens: [], recusa: null, ocioso: false };

function mapItem(
  itens: ItemArquivo[],
  id: string,
  fn: (i: ItemArquivo) => ItemArquivo,
): ItemArquivo[] {
  return itens.map((i) => (i.id === id ? fn(i) : i));
}

export function reducer(estado: EstadoStore, acao: AcaoStore): EstadoStore {
  switch (acao.t) {
    case 'adicionar':
      return { ...estado, recusa: null, ocioso: false, itens: [...estado.itens, ...acao.itens] };
    case 'recusar':
      return { ...estado, recusa: acao.motivo };
    case 'remover':
      return { ...estado, itens: estado.itens.filter((i) => i.id !== acao.id) };
    case 'limparTudo':
      return { ...estado, itens: [], recusa: null };
    case 'ociosidadeExpirou':
      return { itens: [], recusa: null, ocioso: true };
    case 'estado':
      return {
        ...estado,
        itens: mapItem(estado.itens, acao.id, (i) => ({
          ...i,
          estado: transicionar(i.estado, acao.estado),
        })),
      };
    case 'etapa':
      return {
        ...estado,
        itens: mapItem(estado.itens, acao.id, (i) => ({ ...i, etapa: acao.etapa })),
      };
    case 'resultado':
      return {
        ...estado,
        itens: mapItem(estado.itens, acao.id, (i) => ({ ...i, resultado: acao.resultado, etapa: null })),
      };
    case 'correcao':
      return {
        ...estado,
        itens: mapItem(estado.itens, acao.id, (i) => ({
          ...i,
          correcao: { nome: acao.nome, url: acao.url },
        })),
      };
  }
}

interface Ctx {
  estado: EstadoStore;
  dispatch: Dispatch<AcaoStore>;
}
const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [estado, dispatch] = useReducer(reducer, estadoInicial);

  // Revogação de Blob URLs quando a lista esvazia (spec §9.4).
  useEffect(() => {
    if (estado.itens.length === 0) descartarTudo();
  }, [estado.itens.length]);

  const valor = useMemo(() => ({ estado, dispatch }), [estado]);
  return <StoreContext.Provider value={valor}>{children}</StoreContext.Provider>;
}

export function useStore(): Ctx {
  const c = useContext(StoreContext);
  if (!c) throw new Error('useStore fora de <StoreProvider>');
  return c;
}

/** Revoga o download de um item específico (usado ao remover linha). */
export function descartarItem(item: ItemArquivo): void {
  descartar(item.id);
}
