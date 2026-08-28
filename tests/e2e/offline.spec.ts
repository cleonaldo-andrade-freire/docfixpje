import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const fx = (n: string) => join(fixtures, n);

/**
 * Requisito funcional (spec §11): a aplicação funciona offline após o primeiro
 * carregamento, servida pelo service worker (allowlist de caminho). Só roda no
 * build de produção (`vite preview`), onde o SW é registrado.
 */
test('funciona offline após o primeiro carregamento', async ({ page, context }) => {
  test.slow();

  // 1º load: registra e ativa o service worker.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /validador de arquivos/i })).toBeVisible();
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller != null,
    undefined,
    { timeout: 20_000 },
  );

  // Derruba a rede e recarrega — deve vir do cache.
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: /validador de arquivos/i })).toBeVisible();

    // E ainda valida um arquivo (processamento é 100% local).
    await page.getByLabel(/selecionar arquivos/i).setInputFiles(fx('assinado.pdf'));
    await page.getByRole('button', { name: /^validar$/i }).click();
    await expect(
      page.getByRole('listitem', { name: 'assinado.pdf' }).getByText(/contém 1 assinatura digital/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await context.setOffline(false);
  }
});
