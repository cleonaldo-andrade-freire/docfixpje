import type { ItemArquivo } from '../estado/store';
import { LinhaArquivo } from './LinhaArquivo';
import css from './ListaArquivos.module.css';

export function ListaArquivos({
  itens,
  onRemover,
}: {
  itens: ItemArquivo[];
  onRemover: (id: string) => void;
}) {
  if (itens.length === 0) return null;
  return (
    <ul className={css.lista} aria-label="Arquivos para validar">
      {itens.map((item) => (
        <LinhaArquivo key={item.id} item={item} onRemover={onRemover} />
      ))}
    </ul>
  );
}
