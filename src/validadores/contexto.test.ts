import { expect, test } from 'vitest';
import { montarContexto, CONFIG_PADRAO } from './contexto';
import { lerFixture } from '../../scripts/lib/ler-fixture';

const fx = new Proxy({} as Record<string, Uint8Array>, {
  get: (_t, p) => lerFixture(String(p)),
});

test('PDF simples: bloco pdf presente, pdfaId null', async () => {
  const ctx = await montarContexto('simples.pdf', fx['simples.pdf']!, 'application/pdf');
  expect(ctx.pdf).not.toBeNull();
  expect(ctx.pdf!.pdfaId).toBeNull();
  expect(ctx.pdf!.carga.ok).toBe(true);
  expect(ctx.tamanhoBytes).toBe(fx['simples.pdf']!.length);
});

test('PDF/A-1b: pdfaId preenchido', async () => {
  const ctx = await montarContexto('pdfa-1b.pdf', fx['pdfa-1b.pdf']!, 'application/pdf');
  expect(ctx.pdf!.pdfaId).toEqual({ parte: 1, conformidade: 'B' });
});

test('MP3: sem bloco pdf', async () => {
  const ctx = await montarContexto('audio.mp3', fx['audio.mp3']!, 'audio/mpeg');
  expect(ctx.pdf).toBeNull();
});

test('config padrão vem de limites.ts (aviso, partes 1..4)', async () => {
  const ctx = await montarContexto('simples.pdf', fx['simples.pdf']!, 'application/pdf');
  expect(ctx.config).toBe(CONFIG_PADRAO);
  expect(ctx.config.pdfa.pdfaGravidade).toBe('aviso');
});
