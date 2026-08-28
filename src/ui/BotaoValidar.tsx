import { useId } from 'react';

/**
 * Botão Validar (spec §5, §14.2). Lista vazia: desabilitado com aria-disabled
 * e rótulo explicativo associado por aria-describedby.
 */
export function BotaoValidar({
  habilitado,
  validando,
  onValidar,
}: {
  habilitado: boolean;
  validando: boolean;
  onValidar: () => void;
}) {
  const dicaId = useId();
  const desabilitado = !habilitado || validando;

  return (
    <div>
      <button
        type="button"
        onClick={onValidar}
        disabled={desabilitado}
        aria-disabled={desabilitado}
        aria-describedby={!habilitado ? dicaId : undefined}
      >
        {validando ? 'Validando…' : 'Validar'}
      </button>
      {!habilitado && (
        <span id={dicaId} role="note">
          Adicione ao menos um arquivo para validar.
        </span>
      )}
    </div>
  );
}
