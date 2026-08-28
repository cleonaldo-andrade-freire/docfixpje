import type { EstadoLinha as Estado } from '../estado/maquinaLinha';
import { TEXTO_ESTADO } from '../estado/maquinaLinha';
import { CirculoCheck, CirculoVazio, Spinner, TrianguloExclamacao } from './icones';
import css from './EstadoLinha.module.css';

/**
 * Sinalização do estado da linha (spec §6, §1.7): ícone de forma distinta +
 * rótulo textual + cor redundante. Região com aria-live="polite" para o leitor
 * de tela anunciar a etapa corrente — nunca "assertive".
 */

type Cor = 'neutro' | 'verde' | 'vermelho' | 'ambar';

const COR: Record<Estado, Cor> = {
  aguardando: 'neutro',
  validando: 'neutro',
  apto: 'verde',
  inapto: 'vermelho',
  corrigindo: 'ambar',
  corrigido: 'verde',
  correcao_falhou: 'vermelho',
  nao_corrigivel: 'vermelho',
};

function Icone({ estado }: { estado: Estado }) {
  switch (estado) {
    case 'apto':
    case 'corrigido':
      return <CirculoCheck titulo="aprovado" />;
    case 'inapto':
    case 'correcao_falhou':
    case 'nao_corrigivel':
      return <TrianguloExclamacao titulo="não apto" />;
    case 'validando':
    case 'corrigindo':
      return <Spinner titulo="processando" />;
    case 'aguardando':
      return <CirculoVazio titulo="aguardando" />;
  }
}

export function EstadoLinha({
  estado,
  etapa,
  resumo,
}: {
  estado: Estado;
  etapa?: string | null;
  resumo?: string | null;
}) {
  const emAtividade = estado === 'validando' || estado === 'corrigindo';
  const rotulo = emAtividade ? (etapa ?? TEXTO_ESTADO[estado]) : (resumo ?? TEXTO_ESTADO[estado]);

  return (
    <span className={`${css.raiz} ${css[COR[estado]]}`} role="status" aria-live="polite">
      <Icone estado={estado} />
      <span className={css.rotulo}>{rotulo}</span>
    </span>
  );
}
