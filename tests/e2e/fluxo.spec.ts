import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
const fx = (n: string) => join(fixtures, n);

test('upload → Validar → um apto verde e um inapto vermelho com orientação', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/selecionar arquivos/i).setInputFiles([fx('simples.pdf'), fx('assinado.pdf')]);

  const linhaSimples = page.getByRole('listitem').filter({ hasText: 'simples.pdf' });
  const linhaAssinado = page.getByRole('listitem').filter({ hasText: 'assinado.pdf' });
  await expect(linhaSimples.getByText('Aguardando validação')).toBeVisible();

  await page.getByRole('button', { name: /^validar$/i }).click();

  await expect(linhaSimples.getByText('Pronto para anexar ao PJe')).toBeVisible();
  await expect(linhaSimples.getByRole('img', { name: /aprovado/i })).toBeVisible();

  await expect(linhaAssinado.getByText(/contém 1 assinatura digital/i).first()).toBeVisible();
  await expect(linhaAssinado.getByRole('img', { name: /não apto/i }).first()).toBeVisible();
  await expect(linhaAssinado.getByRole('button', { name: /tentar corrigir/i })).toBeVisible();
});

test('lote acima do máximo é recusado sem travar', async ({ page }) => {
  await page.goto('/');
  const muitos = Array.from({ length: 21 }, () => fx('simples.pdf'));
  await page.getByLabel(/selecionar arquivos/i).setInputFiles(muitos);
  await expect(page.getByRole('alert')).toContainText(/máximo de 20 arquivos/i);
  await expect(page.getByRole('listitem')).toHaveCount(0);
});

test('o botão Validar começa desabilitado', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^validar$/i })).toBeDisabled();
});
