import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const fx = (n: string) => join(fixtures, n);

async function validar(page: import('@playwright/test').Page, arquivo: string, query = '') {
  await page.goto(`/${query}`);
  await page.getByLabel(/selecionar arquivos/i).setInputFiles(fx(arquivo));
  await page.getByRole('button', { name: /^validar$/i }).click();
}

test('assinado → Tentar corrigir → corrigido, com download (motor de teste)', async ({ page }) => {
  await validar(page, 'assinado.pdf', '?e2e=1');
  const linha = page.getByRole('listitem', { name: 'assinado.pdf' });
  await linha.getByRole('button', { name: /tentar corrigir/i }).click();

  await expect(linha.getByText('Corrigido — revalidado com sucesso')).toBeVisible({ timeout: 15_000 });
  await expect(linha.getByRole('link', { name: /baixar arquivo corrigido/i })).toHaveAttribute(
    'download',
    'assinado-corrigido.pdf',
  );
  await expect(linha.getByRole('button', { name: /baixar original/i })).toBeVisible();
  // aviso legal apareceu na 1a correção
  await expect(page.getByText(/documento novo/i)).toBeVisible();
});

// O fluxo "corrigido" com motor REAL (Ghostscript-WASM) vive em
// correcao-real.spec.ts; aqui, o motor de teste (?e2e=1) dá determinismo à UI.

test('PDF com /Encrypt de restrições → validado sem erro de senha', async ({ page }) => {
  await validar(page, 'criptografado.pdf');
  const linha = page.getByRole('listitem', { name: 'criptografado.pdf' });
  await expect(linha.getByText('Pronto para anexar ao PJe')).toBeVisible();
  await expect(linha.getByText(/protegido por senha/i)).toHaveCount(0);
});

test('PDF assinado E criptografado → Tentar corrigir → corrigido (motor de teste)', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.getByLabel(/selecionar arquivos/i).setInputFiles(fx('assinado-criptografado.pdf'));
  await page.getByRole('button', { name: /^validar$/i }).click();
  const linha = page.getByRole('listitem', { name: 'assinado-criptografado.pdf' });
  await linha.getByRole('button', { name: /tentar corrigir/i }).click();
  await expect(linha.getByText('Corrigido — revalidado com sucesso')).toBeVisible({ timeout: 15_000 });
});

test('MP4 de dezenas de MB → apto (limite de mídia é 200 MB, não 10)', async ({ page }) => {
  await validar(page, 'video-grande.mp4');
  const linha = page.getByRole('listitem', { name: 'video-grande.mp4' });
  await expect(linha.getByText('Pronto para anexar ao PJe')).toBeVisible();
  await expect(linha.getByRole('button', { name: /tentar corrigir/i })).toHaveCount(0);
});

test('nenhuma requisição a terceiros durante um ciclo de correção', async ({ page }) => {
  const externas: string[] = [];
  page.on('request', (r) => {
    const h = new URL(r.url()).host;
    if (h !== 'localhost:4174') externas.push(r.url());
  });
  await validar(page, 'assinado.pdf', '?e2e=1');
  await page
    .getByRole('listitem', { name: 'assinado.pdf' })
    .getByRole('button', { name: /tentar corrigir/i })
    .click();
  await expect(page.getByText('Corrigido — revalidado com sucesso')).toBeVisible({ timeout: 15_000 });
  expect(externas).toEqual([]);
});
