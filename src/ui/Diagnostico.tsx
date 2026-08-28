import type { ResultadoCorrecao, ResultadoValidacao } from '../tipos';
import type { EstadoLinha } from '../estado/maquinaLinha';
import { montarOrientacaoManual } from '../orientacao/manual';
import css from './Diagnostico.module.css';

/**
 * Painel de diagnóstico da linha (spec §5, §7.4, §8.2). Mostra as ocorrências,
 * o fluxo de correção manual (encadeado quando assinatura+PDF/A) e, na Fase 2,
 * os avisos da tentativa de correção automática.
 */
export function Diagnostico({
  resultado,
  estado,
  resultadoCorrecao,
  orientacaoCorrecao,
}: {
  resultado: ResultadoValidacao;
  estado?: EstadoLinha;
  resultadoCorrecao?: ResultadoCorrecao | null;
  orientacaoCorrecao?: string | null;
}) {
  const { ocorrencias } = resultado;
  const nada = resultado.apto && ocorrencias.length === 0 && !orientacaoCorrecao;
  if (nada) return null;

  // Depois de corrigido, o diagnóstico antigo perde a relevância.
  const mostrarOcorrencias = estado !== 'corrigido';
  const orientacoes =
    resultado.apto || estado === 'corrigido' ? [] : montarOrientacaoManual(ocorrencias);
  const avisosCorrecao = resultadoCorrecao?.avisos ?? [];

  return (
    <div className={css.raiz}>
      {mostrarOcorrencias &&
        ocorrencias.map((o, i) => (
          <div className={css.ocorrencia} key={`${o.codigo}-${i}`}>
            <span
              className={`${css.badge} ${o.gravidade === 'erro' ? css.badgeErro : css.badgeAviso}`}
            >
              {o.gravidade === 'erro' ? 'Erro' : 'Aviso'}
            </span>
            <span className={css.mensagem}>{o.mensagem}</span>
            {o.orientacao && <span className={css.orientacao}>{o.orientacao}</span>}
            {o.detalheTecnico && (
              <details className={css.detalhe}>
                <summary>Detalhe técnico</summary>
                <pre>{o.detalheTecnico}</pre>
              </details>
            )}
          </div>
        ))}

      {orientacoes.map((g, i) => (
        <div key={`ori-${i}`}>
          <p className={css.mensagem}>{g.resumo}</p>
          <ol className={css.passos}>
            {g.passos.map((p, j) => (
              <li key={j}>
                <span className={css.passoTitulo}>{p.titulo}</span>
                {' — '}
                {p.detalhe}
              </li>
            ))}
          </ol>
        </div>
      ))}

      {avisosCorrecao.length > 0 && (
        <ul className={css.passos}>
          {avisosCorrecao.map((a, i) => (
            <li key={`av-${i}`} className={css.orientacao}>
              {a}
            </li>
          ))}
        </ul>
      )}

      {orientacaoCorrecao && <p className={css.orientacao}>{orientacaoCorrecao}</p>}

      {resultadoCorrecao?.sucesso && (
        <p className={css.orientacao}>
          Tamanho: {resultadoCorrecao.tamanhoAntes} → {resultadoCorrecao.tamanhoDepois} bytes.
          {resultadoCorrecao.textoPreservado ? ' Texto preservado.' : ''}
        </p>
      )}
    </div>
  );
}
