import type { ResultadoValidacao } from '../tipos';
import { montarOrientacaoManual } from '../orientacao/manual';
import css from './Diagnostico.module.css';

/**
 * Painel de diagnóstico da linha (spec §5, §7.4). Na Fase 1 não há botão
 * "Tentar corrigir" — só orientação textual. O fluxo encadeado assinatura+PDF/A
 * aparece como UMA lista ordenada.
 */
export function Diagnostico({ resultado }: { resultado: ResultadoValidacao }) {
  const { ocorrencias } = resultado;
  if (resultado.apto && ocorrencias.length === 0) return null;

  const orientacoes = montarOrientacaoManual(ocorrencias);
  const temCorrecaoAutomatica = resultado.corrigivel;
  const criptografado = ocorrencias.some((o) => o.codigo === 'ARQUIVO_CRIPTOGRAFADO');

  return (
    <div className={css.raiz}>
      {ocorrencias.map((o, i) => (
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

      {temCorrecaoAutomatica && !criptografado && (
        <p className={css.nota}>
          A correção automática chega na próxima versão. Por ora, siga os passos acima.
        </p>
      )}
    </div>
  );
}
