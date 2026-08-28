import { test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fx = (n: string) => join(raiz, 'fixtures', n);
const destino = (n: string) => join(raiz, 'docs', 'evidencias', n);

/**
 * Captura todos os estados de linha alcançáveis (spec §1.4), em
 * desktop/mobile × claro/escuro. Só fixtures sintéticas.
 */
test('screenshots dos estados da linha', async ({ page }, testInfo) => {
  const sufixo = testInfo.project.name;

  await page.goto('/?e2e=1');
  await page.screenshot({ path: destino(`tela-inicial-${sufixo}.png`), fullPage: true });

  await page.getByLabel(/selecionar arquivos/i).setInputFiles([
    fx('simples.pdf'),
    fx('assinado.pdf'),
    fx('criptografado.pdf'),
    fx('video-grande.mp4'),
  ]);
  await page.screenshot({ path: destino(`aguardando-${sufixo}.png`), fullPage: true });

  await page.getByRole('button', { name: /^validar$/i }).click();
  await page.getByText('Pronto para anexar ao PJe').waitFor();
  await page.screenshot({ path: destino(`validado-${sufixo}.png`), fullPage: true });

  // corrigido (motor de teste via ?e2e=1)
  await page
    .getByRole('listitem', { name: 'assinado.pdf' })
    .getByRole('button', { name: /tentar corrigir/i })
    .click();
  await page.getByText('Corrigido — revalidado com sucesso').waitFor({ timeout: 15_000 });
  await page.screenshot({ path: destino(`corrigido-${sufixo}.png`), fullPage: true });

  // estados de falha, SEM motor: correcao_falhou (assinado) + nao_corrigivel (cripto)
  await page.goto('/');
  await page.getByLabel(/selecionar arquivos/i).setInputFiles([fx('assinado.pdf'), fx('criptografado.pdf')]);
  await page.getByRole('button', { name: /^validar$/i }).click();
  const linhaFalha = page.getByRole('listitem', { name: 'assinado.pdf' });
  await linhaFalha.getByRole('button', { name: /tentar corrigir/i }).click();
  await linhaFalha.getByText('Não foi possível corrigir automaticamente').waitFor({ timeout: 15_000 });
  await page.screenshot({ path: destino(`estados-correcao-${sufixo}.png`), fullPage: true });
});

test('gravação do ciclo completo (desktop claro)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-claro', 'grava só uma vez');
  await page.goto('/?e2e=1');
  await page.getByLabel(/selecionar arquivos/i).setInputFiles([fx('assinado.pdf')]);
  await page.getByRole('button', { name: /^validar$/i }).click();
  const linha = page.getByRole('listitem', { name: 'assinado.pdf' });
  await linha.getByText(/contém 1 assinatura digital/i).first().waitFor();
  await linha.getByRole('button', { name: /tentar corrigir/i }).click();
  await linha.getByText('Corrigido — revalidado com sucesso').waitFor({ timeout: 15_000 });
  await linha.getByRole('link', { name: /baixar arquivo corrigido/i }).waitFor();
  await page.getByRole('button', { name: /limpar tudo/i }).click();
  await page.getByRole('listitem').waitFor({ state: 'detached' }).catch(() => {});
});
