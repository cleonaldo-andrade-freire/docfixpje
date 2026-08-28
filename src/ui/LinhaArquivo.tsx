import type { ItemArquivo } from '../estado/store';
import { formatarTamanho, tipoLegivel } from '../infra/formato';
import { EstadoLinha } from './EstadoLinha';
import { Diagnostico } from './Diagnostico';
import css from './LinhaArquivo.module.css';

function resumoOcorrencias(item: ItemArquivo): string | null {
  const r = item.resultado;
  if (!r || r.apto) return null;
  const erros = r.ocorrencias.filter((o) => o.gravidade === 'erro');
  if (erros.length === 0) return null;
  if (erros.length === 1) return erros[0]!.mensagem;
  return `${erros.length} problemas encontrados`;
}

export function LinhaArquivo({
  item,
  onRemover,
}: {
  item: ItemArquivo;
  onRemover: (id: string) => void;
}) {
  const emAtividade = item.estado === 'validando' || item.estado === 'corrigindo';

  return (
    <li className={css.raiz}>
      <div className={css.grade}>
        <span className={css.nome} title={item.file.name}>
          {item.file.name}
        </span>
        <span className={css.tipo}>{tipoLegivel(item.tipoRapido)}</span>
        <span className={`${css.tamanho} num-tabular`}>{formatarTamanho(item.file.size)}</span>
        <span className={css.estado}>
          <EstadoLinha estado={item.estado} etapa={item.etapa} resumo={resumoOcorrencias(item)} />
        </span>
        {!emAtividade && (
          <button
            type="button"
            className={css.remover}
            onClick={() => onRemover(item.id)}
            aria-label={`Remover ${item.file.name} da lista`}
          >
            ✕
          </button>
        )}
      </div>
      {item.resultado && (
        <div className={css.diagnostico}>
          <Diagnostico resultado={item.resultado} />
        </div>
      )}
    </li>
  );
}
