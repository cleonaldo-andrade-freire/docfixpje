import { ENDERECO_OFICIAL } from '../config/limites';
import css from './AvisoPrivacidade.module.css';

/**
 * Declaração de privacidade curta e verificável (spec §9.6, §11) e endereço
 * oficial da ferramenta (spec §10.4). Não promete "apagamento seguro".
 */
export function AvisoPrivacidade() {
  return (
    <aside className={css.raiz}>
      <svg
        className={css.icone}
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
      <div className={css.texto}>
        <p className={css.frase}>
          Seus arquivos ficam só na memória deste navegador. Nada é enviado para nenhum
          servidor e tudo some ao fechar a aba.
        </p>
        <p className={css.endereco}>
          Endereço oficial: <strong>{ENDERECO_OFICIAL}</strong>
        </p>
      </div>
    </aside>
  );
}
