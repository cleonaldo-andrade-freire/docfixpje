import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const fx = (n: string) => join(fixtures, n);

test('nada é persistido; F5 não restaura a sessão (spec §14.4)', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/selecionar arquivos/i).setInputFiles([fx('simples.pdf'), fx('assinado.pdf')]);
  await page.getByRole('button', { name: /^validar$/i }).click();
  await expect(page.getByText('Pronto para anexar ao PJe')).toBeVisible();

  const estado = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    idbs: (await indexedDB.databases?.())?.length ?? 0,
    titulo: document.title,
    url: location.href,
  }));
  expect(estado.local).toBe(0);
  expect(estado.session).toBe(0);
  expect(estado.idbs).toBe(0);
  expect(estado.titulo).not.toMatch(/simples\.pdf|assinado\.pdf/);
  expect(estado.url).not.toMatch(/simples\.pdf|assinado\.pdf/);

  await page.reload();
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('Limpar tudo esvazia a lista', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/selecionar arquivos/i).setInputFiles([fx('simples.pdf')]);
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: /limpar tudo/i }).click();
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('nenhuma requisição a domínio de terceiro durante um ciclo completo', async ({ page }) => {
  const externas: string[] = [];
  page.on('request', (r) => {
    const h = new URL(r.url()).host;
    if (h !== 'localhost:4174') externas.push(r.url());
  });
  await page.goto('/');
  await page.getByLabel(/selecionar arquivos/i).setInputFiles([fx('assinado.pdf')]);
  await page.getByRole('button', { name: /^validar$/i }).click();
  await expect(page.getByText(/contém 1 assinatura digital/i).first()).toBeVisible();
  expect(externas).toEqual([]);
});
