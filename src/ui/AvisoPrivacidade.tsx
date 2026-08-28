import { ENDERECO_OFICIAL } from '../config/limites';
import css from './AvisoPrivacidade.module.css';

/**
 * Declaração de privacidade curta e verificável (spec §9.6, §11) e endereço
 * oficial da ferramenta (spec §10.4). Não promete "apagamento seguro".
 */
export function AvisoPrivacidade() {
  return (
    <aside className={css.raiz}>
      <p className={css.frase}>
        Seus arquivos ficam só na memória deste navegador. Nada é enviado para
        nenhum servidor e tudo some ao fechar a aba.
      </p>
      <p className={css.endereco}>
        Endereço oficial: <strong>{ENDERECO_OFICIAL}</strong>
      </p>
    </aside>
  );
}
