import { describe, expect, test } from 'vitest';
import { carregarPdf, varrerTrailerBruto } from './estrutura';
import { lerFixture } from '../../scripts/lib/ler-fixture';

const fx = new Proxy({} as Record<string, Uint8Array>, {
  get: (_t, p) => lerFixture(String(p)),
});

describe('carregarPdf', () => {
  test('PDF simples carrega ok', async () => {
    const r = await carregarPdf(fx['simples.pdf']!);
    expect(r.ok).toBe(true);
  });

  test('PDF com /Encrypt que abre (restrições) -> ok, encriptado:true', async () => {
    const r = await carregarPdf(fx['criptografado.pdf']!);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.encriptado).toBe(true);
  });

  test('bytes lixo com "encrypted" na mensagem -> ARQUIVO_CRIPTOGRAFADO', async () => {
    // pdf-lib não abre nem ignorando a cifra
    const r = await carregarPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0, 1, 2, 3]));
    expect(r.ok).toBe(false);
  });

  test('bytes lixo -> ARQUIVO_CORROMPIDO', async () => {
    const r = await carregarPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]));
    expect(r).toEqual({ ok: false, motivo: 'ARQUIVO_CORROMPIDO' });
  });

  test('assinado.pdf ainda carrega (estrutura válida)', async () => {
    const r = await carregarPdf(fx['assinado.pdf']!);
    expect(r.ok).toBe(true);
  });
});

describe('varrerTrailerBruto', () => {
  test('acha assinatura em PDF assinado', () => {
    const t = varrerTrailerBruto(fx['assinado.pdf']!);
    expect(t.temByteRangeEContents).toBe(true);
    expect(t.sigFlags).toBe(3);
    expect(t.nomesCamposSig).toContain('Signature1');
    expect(t.camposSigComV).toBeGreaterThanOrEqual(1);
    expect(t.temAcroForm).toBe(true);
  });

  test('campo de assinatura vazio: sem /V, sem ByteRange, SigFlags 1', () => {
    const t = varrerTrailerBruto(fx['campo-sig-vazio.pdf']!);
    expect(t.temByteRangeEContents).toBe(false);
    expect(t.sigFlags).toBe(1);
    expect(t.camposSigComV).toBe(0);
    expect(t.nomesCamposSig).toContain('Assinatura1');
  });

  test('docmdp.pdf: /Perms com /DocMDP', () => {
    const t = varrerTrailerBruto(fx['docmdp.pdf']!);
    expect(t.temPerms).toBe(true);
    expect(t.temDocMDP).toBe(true);
  });

  test('PDF limpo não acha nada', () => {
    const t = varrerTrailerBruto(fx['simples.pdf']!);
    expect(t.temByteRangeEContents).toBe(false);
    expect(t.temEncrypt).toBe(false);
    expect(t.temPerms).toBe(false);
    expect(t.nomesCamposSig).toEqual([]);
    expect(t.sigFlags).toBeNull();
  });

  test('criptografado.pdf: temEncrypt', () => {
    expect(varrerTrailerBruto(fx['criptografado.pdf']!).temEncrypt).toBe(true);
  });
});
