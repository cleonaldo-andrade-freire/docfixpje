import type { ItemArquivo } from '../estado/store';
import { LinhaArquivo } from './LinhaArquivo';
import css from './ListaArquivos.module.css';

export function ListaArquivos({
  itens,
  onRemover,
  onCorrigir,
  onBaixarOriginal,
  corrigindoAlgum = false,
}: {
  itens: ItemArquivo[];
  onRemover: (id: string) => void;
  onCorrigir?: ((id: string) => void) | undefined;
  onBaixarOriginal?: ((item: ItemArquivo) => void) | undefined;
  corrigindoAlgum?: boolean | undefined;
}) {
  if (itens.length === 0) return null;
  return (
    <ul className={css.lista} aria-label="Arquivos para validar">
      {itens.map((item) => (
        <LinhaArquivo
          key={item.id}
          item={item}
          onRemover={onRemover}
          onCorrigir={onCorrigir}
          onBaixarOriginal={onBaixarOriginal}
          corrigindoOutro={corrigindoAlgum && item.estado !== 'corrigindo'}
        />
      ))}
    </ul>
  );
}
