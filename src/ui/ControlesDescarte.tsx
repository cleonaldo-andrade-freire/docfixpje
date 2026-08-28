/**
 * "Limpar tudo" e o aviso de descarte por inatividade (spec §9.5).
 */
export function ControlesDescarte({
  temItens,
  ocioso,
  onLimparTudo,
}: {
  temItens: boolean;
  ocioso: boolean;
  onLimparTudo: () => void;
}) {
  return (
    <div>
      {ocioso && (
        <p role="status">Os arquivos foram descartados por inatividade.</p>
      )}
      {temItens && (
        <button type="button" onClick={onLimparTudo}>
          Limpar tudo
        </button>
      )}
    </div>
  );
}
