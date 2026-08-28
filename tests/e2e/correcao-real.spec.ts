import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fx = (n: string) =>
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', n);

/**
 * Correção REAL: usa o Ghostscript-WASM embarcado (sem ?e2e=1). Roda só no
 * Chromium desktop para não multiplicar o custo — a UI já é coberta pelo motor
 * de teste em correcao.spec.ts.
 */
test.describe('motor real (Ghostscript-WASM)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'motor real só no chromium');

  test('PDF assinado → Tentar corrigir → corrigido, e o corrigido revalida sem assinatura', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await page.getByLabel(/selecionar arquivos/i).setInputFiles(fx('assinado.pdf'));
    await page.getByRole('button', { name: /^validar$/i }).click();

    const linha = page.getByRole('listitem', { name: 'assinado.pdf' });
    await linha.getByRole('button', { name: /tentar corrigir/i }).click();

    await expect(linha.getByText('Corrigido — revalidado com sucesso')).toBeVisible({
      timeout: 150_000,
    });
    await expect(linha.getByText(/Texto preservado/i)).toBeVisible();
    await expect(linha.getByRole('link', { name: /baixar arquivo corrigido/i })).toHaveAttribute(
      'download',
      'assinado-corrigido.pdf',
    );
  });

  test('sem rede: nenhuma requisição a terceiros durante a correção real', async ({ page }) => {
    test.setTimeout(180_000);
    const externas: string[] = [];
    page.on('request', (r) => {
      const h = new URL(r.url()).host;
      if (h !== 'localhost:4174') externas.push(r.url());
    });
    await page.goto('/');
    await page.getByLabel(/selecionar arquivos/i).setInputFiles(fx('assinado.pdf'));
    await page.getByRole('button', { name: /^validar$/i }).click();
    const linha = page.getByRole('listitem', { name: 'assinado.pdf' });
    await linha.getByRole('button', { name: /tentar corrigir/i }).click();
    await expect(linha.getByText(/Corrigido|Não foi possível/)).toBeVisible({ timeout: 150_000 });
    expect(externas).toEqual([]);
  });
});
