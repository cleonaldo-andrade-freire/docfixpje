import type { ResultadoCorrecao, ResultadoValidacao } from '../tipos';
import type { EstadoLinha } from '../estado/maquinaLinha';
import { montarOrientacaoManual } from '../orientacao/manual';
import css from './Diagnostico.module.css';

/**
 * Painel de diagnóstico da linha. Só aparece quando há algo ACIONÁVEL:
 * ocorrências de gravidade `erro` (avisos não são impeditivos e não são
 * mostrados) ou o resultado/orientação de uma tentativa de correção. Linha
 * aprovada não mostra painel nenhum — só a mensagem de estado.
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
  const erros = resultado.ocorrencias.filter((o) => o.gravidade === 'erro');
  const mostrarErros = estado !== 'corrigido' && estado !== 'apto';
  const avisosCorrecao = resultadoCorrecao?.avisos ?? [];

  // A orientação de correção MANUAL só aparece quando a automática não é opção
  // (erro não corrigível) ou quando ela já falhou. Enquanto a linha está
  // `inapto` e é corrigível, o caminho é o botão "Tentar corrigir".
  const podeAutoCorrigir = resultado.corrigivel && estado === 'inapto';
  const orientacoes =
    mostrarErros && erros.length > 0 && !podeAutoCorrigir ? montarOrientacaoManual(erros) : [];

  const semConteudo =
    (!mostrarErros || erros.length === 0) &&
    orientacoes.length === 0 &&
    avisosCorrecao.length === 0 &&
    !orientacaoCorrecao;
  if (semConteudo) return null;

  return (
    <div className={css.raiz}>
      {mostrarErros &&
        erros.map((o, i) => (
          <div className={css.ocorrencia} key={`${o.codigo}-${i}`}>
            <span className={`${css.badge} ${css.badgeErro}`}>Erro</span>
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
    </div>
  );
}
