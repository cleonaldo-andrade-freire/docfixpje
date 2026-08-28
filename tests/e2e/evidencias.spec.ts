import { test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fx = (n: string) => join(raiz, 'fixtures', n);
const destino = (n: string) => join(raiz, 'docs', 'evidencias', n);

/**
 * Captura os estados de linha alcançáveis na Fase 1 (aguardando, validando,
 * apto, inapto) em desktop/mobile × claro/escuro. Só fixtures sintéticas.
 */
test('screenshots dos estados da linha', async ({ page }, testInfo) => {
  const sufixo = testInfo.project.name; // desktop-claro, mobile-escuro, ...

  await page.goto('/');
  await page.screenshot({ path: destino(`tela-inicial-${sufixo}.png`), fullPage: true });

  await page.getByLabel(/selecionar arquivos/i).setInputFiles([
    fx('simples.pdf'),
    fx('assinado.pdf'),
    fx('acima-limite.pdf'),
  ]);
  await page.screenshot({ path: destino(`aguardando-${sufixo}.png`), fullPage: true });

  await page.getByRole('button', { name: /^validar$/i }).click();
  await page.getByText('Pronto para anexar ao PJe').waitFor();
  await page.screenshot({ path: destino(`validado-${sufixo}.png`), fullPage: true });
});

test('gravação do ciclo completo (desktop claro)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-claro', 'grava só uma vez');
  await page.goto('/');
  await page.getByLabel(/selecionar arquivos/i).setInputFiles([fx('assinado.pdf')]);
  await page.getByRole('button', { name: /^validar$/i }).click();
  await page.getByText(/contém 1 assinatura digital/i).first().waitFor();
  await page.getByText(/remova a assinatura reimprimindo/i).waitFor();
  await page.getByRole('button', { name: /limpar tudo/i }).click();
  await page.getByRole('listitem').waitFor({ state: 'detached' }).catch(() => {});
});
