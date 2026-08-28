import css from './AvisoLegalCorrecao.module.css';

/**
 * Aviso legal exibido UMA vez por sessão, na primeira correção (spec §8.3.5).
 * Texto curto, não-modal, não bloqueante.
 */
export function AvisoLegalCorrecao() {
  return (
    <p className={css.raiz} role="note">
      A correção gera um <strong>documento novo</strong>, sem a assinatura digital original. Em
      geral isso não é problema — a autenticidade desses documentos é verificada pelo código ou
      QR code impresso na própria página, não pela assinatura embarcada. Ainda assim, confira o
      resultado antes de protocolar.
    </p>
  );
}
