import type { ItemArquivo } from '../estado/store';
import { formatarTamanho, tipoLegivel } from '../infra/formato';
import { EstadoLinha } from './EstadoLinha';
import { Diagnostico } from './Diagnostico';
import { BotaoCorrigir } from './BotaoCorrigir';
import css from './LinhaArquivo.module.css';

function resumoOcorrencias(item: ItemArquivo): string | null {
  // Nos estados de correção, o texto vem de TEXTO_ESTADO / da orientação, não
  // do diagnóstico de validação antigo.
  if (item.estado !== 'inapto') return null;
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
  onCorrigir,
  onBaixarOriginal,
  corrigindoOutro = false,
}: {
  item: ItemArquivo;
  onRemover: (id: string) => void;
  onCorrigir?: ((id: string) => void) | undefined;
  onBaixarOriginal?: ((item: ItemArquivo) => void) | undefined;
  corrigindoOutro?: boolean | undefined;
}) {
  const emAtividade = item.estado === 'validando' || item.estado === 'corrigindo';

  // Linha aprovada não mostra painel — só a mensagem de estado (spec §6).
  const temErro = (item.resultado?.ocorrencias ?? []).some((o) => o.gravidade === 'erro');
  const mostrarPainel =
    !!item.resultado &&
    item.estado !== 'apto' &&
    (temErro || item.estado === 'corrigido' || item.estado === 'correcao_falhou' || item.estado === 'nao_corrigivel');

  return (
    <li className={css.raiz} aria-label={item.file.name}>
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
      {mostrarPainel && item.resultado && (
        <div className={css.diagnostico}>
          <Diagnostico
            resultado={item.resultado}
            estado={item.estado}
            resultadoCorrecao={item.resultadoCorrecao}
            orientacaoCorrecao={item.orientacaoCorrecao}
          />
          {onCorrigir && onBaixarOriginal && (
            <BotaoCorrigir
              item={item}
              desabilitado={corrigindoOutro}
              onCorrigir={onCorrigir}
              onBaixarOriginal={onBaixarOriginal}
            />
          )}
        </div>
      )}
    </li>
  );
}
