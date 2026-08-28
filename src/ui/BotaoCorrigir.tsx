import type { ItemArquivo } from '../estado/store';
import css from './BotaoCorrigir.module.css';

/**
 * Ações de correção da linha (spec §5.6, §8.3.3-4):
 * - `inapto` + corrigível → "Tentar corrigir"
 * - `corrigido` → "Baixar arquivo corrigido" + "Baixar original" (o original
 *   permanece intocado e disponível)
 * - `apto` / `nao_corrigivel` / `correcao_falhou` → nenhum botão
 */
export function BotaoCorrigir({
  item,
  desabilitado = false,
  onCorrigir,
  onBaixarOriginal,
}: {
  item: ItemArquivo;
  desabilitado?: boolean | undefined;
  onCorrigir: (id: string) => void;
  onBaixarOriginal: (item: ItemArquivo) => void;
}) {
  if (item.estado === 'inapto' && item.resultado?.corrigivel) {
    return (
      <div className={css.raiz}>
        <button
          type="button"
          className={css.acao}
          disabled={desabilitado}
          onClick={() => onCorrigir(item.id)}
        >
          Tentar corrigir
        </button>
        {desabilitado && <span className={css.link}>aguarde a correção em andamento…</span>}
      </div>
    );
  }

  if (item.estado === 'corrigido' && item.correcao) {
    return (
      <div className={css.raiz}>
        <a className={`${css.acao} ${css.primario}`} href={item.correcao.url} download={item.correcao.nome}>
          Baixar arquivo corrigido
        </a>
        <button type="button" className={css.link} onClick={() => onBaixarOriginal(item)}>
          Baixar original
        </button>
      </div>
    );
  }

  return null;
}
