/**
 * Tipos mínimos para `jest-axe` (o pacote não traz .d.ts e `@types/jest-axe`
 * arrastaria `@types/jest`, que quebra a assinatura de `expect` do vitest).
 */
declare module 'jest-axe' {
  export interface AxeResults {
    violations: unknown[];
  }
  export function axe(html: Element | string, options?: unknown): Promise<AxeResults>;
  export const toHaveNoViolations: {
    toHaveNoViolations(results: AxeResults): { pass: boolean; message: () => string };
  };
  export function configureAxe(options?: unknown): typeof axe;
}
