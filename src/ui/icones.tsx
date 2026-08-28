/**
 * Ícones de estado, distintos pela FORMA (spec §1.7): a cor nunca é o único
 * portador de significado. Cada um traz <title> para leitor de tela.
 */

interface PropsIcone {
  titulo: string;
  tamanho?: number;
}

/** Aprovado: círculo com check. */
export function CirculoCheck({ titulo, tamanho = 20 }: PropsIcone) {
  return (
    <svg
      role="img"
      aria-label={titulo}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <title>{titulo}</title>
      <circle cx="10" cy="10" r="8" />
      <path d="M6 10.5l2.5 2.5L14 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Reprovado: triângulo com exclamação. */
export function TrianguloExclamacao({ titulo, tamanho = 20 }: PropsIcone) {
  return (
    <svg
      role="img"
      aria-label={titulo}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <title>{titulo}</title>
      <path d="M10 2.5L18.5 17H1.5L10 2.5z" strokeLinejoin="round" />
      <path d="M10 8v4" strokeLinecap="round" />
      <circle cx="10" cy="14.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Em processamento: anel giratório (respeita prefers-reduced-motion via CSS). */
export function Spinner({ titulo, tamanho = 20 }: PropsIcone) {
  return (
    <svg
      role="img"
      aria-label={titulo}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      data-spinner="true"
    >
      <title>{titulo}</title>
      <circle cx="10" cy="10" r="8" opacity="0.25" />
      <path d="M10 2a8 8 0 0 1 8 8" strokeLinecap="round" />
    </svg>
  );
}

/** Aguardando: círculo vazio neutro. */
export function CirculoVazio({ titulo, tamanho = 20 }: PropsIcone) {
  return (
    <svg
      role="img"
      aria-label={titulo}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <title>{titulo}</title>
      <circle cx="10" cy="10" r="8" strokeDasharray="3 3" />
    </svg>
  );
}
