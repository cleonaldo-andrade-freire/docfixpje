import { describe, expect, test } from 'vitest';
import { varrerCriptografia } from '../pdf/estrutura';
import { bloqueiaAssinatura, validarCriptografia } from './criptografia';
import { montarContexto, CONFIG_PADRAO } from './contexto';
import { lerFixture } from '../../scripts/lib/ler-fixture';

const bytes = (s: string) => new TextEncoder().encode(s);

/** PDF mínimo com dicionário de criptografia indireto, como os reais. */
const comEncrypt = (corpoDict: string) =>
  bytes(
    `%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n` +
      `19 0 obj\n${corpoDict}\nendobj\n` +
      `trailer\n<< /Root 1 0 R /Encrypt 19 0 R >>\nstartxref\n0\n%%EOF\n`,
  );

describe('varrerCriptografia', () => {
  test('sem /Encrypt -> null', () => {
    expect(varrerCriptografia(bytes('%PDF-1.7\ntrailer\n<< /Root 1 0 R >>\n%%EOF'))).toBeNull();
  });

  test('resolve a referência indireta e lê método, V, R e /P', () => {
    const c = varrerCriptografia(
      comEncrypt('<< /Filter /Standard /V 5 /R 6 /CF << /StdCF << /CFM /AESV3 >> >> /P -1340 >>'),
    );
    expect(c).not.toBeNull();
    expect(c!.metodo).toBe('AESV3');
    expect(c!.v).toBe(5);
    expect(c!.r).toBe(6);
    expect(c!.permissoes!.p).toBe(-1340);
  });

  // /P -1340 = 0xFFFFFAC4 — o valor do caso real do ONR.
  test('/P -1340: imprime, mas nega alterar, anotar, preencher e montar', () => {
    const p = varrerCriptografia(comEncrypt('<< /Filter /Standard /P -1340 >>'))!.permissoes!;
    expect(p.imprimir).toBe(true);
    expect(p.modificarConteudo).toBe(false);
    expect(p.copiarTexto).toBe(false);
    expect(p.anotar).toBe(false);
    expect(p.preencherFormulario).toBe(false);
    expect(p.montarDocumento).toBe(false);
  });

  test('/P -4 libera tudo; /P -3904 nega tudo', () => {
    const livre = varrerCriptografia(comEncrypt('<< /Filter /Standard /P -4 >>'))!.permissoes!;
    expect(livre.imprimir && livre.modificarConteudo && livre.anotar).toBe(true);
    expect(livre.preencherFormulario && livre.montarDocumento).toBe(true);

    const preso = varrerCriptografia(comEncrypt('<< /Filter /Standard /P -3904 >>'))!.permissoes!;
    expect(preso.imprimir).toBe(false);
    expect(preso.montarDocumento).toBe(false);
  });

  test('dicionário sem /P -> permissoes null, e isso não bloqueia', () => {
    const c = varrerCriptografia(comEncrypt('<< /Filter /Standard /V 2 /R 3 >>'))!;
    expect(c.permissoes).toBeNull();
    expect(bloqueiaAssinatura(c.permissoes)).toBe(false);
  });

  test('dicionário embutido no trailer, sem referência indireta', () => {
    const c = varrerCriptografia(
      bytes(
        '%PDF-1.7\ntrailer\n<< /Root 1 0 R /Encrypt << /Filter /Standard /V 1 /R 2 /P -60 >> >>\n%%EOF',
      ),
    );
    expect(c!.permissoes!.p).toBe(-60);
  });
});

describe('bloqueiaAssinatura', () => {
  const perms = (over: Partial<Record<string, boolean>> = {}) => ({
    p: 0,
    imprimir: true,
    modificarConteudo: true,
    copiarTexto: true,
    anotar: true,
    preencherFormulario: true,
    montarDocumento: true,
    ...over,
  });

  test('todas as permissões de assinatura liberadas -> não bloqueia', () => {
    expect(bloqueiaAssinatura(perms())).toBe(false);
  });

  test('qualquer uma das quatro negada -> bloqueia', () => {
    for (const chave of ['modificarConteudo', 'anotar', 'preencherFormulario', 'montarDocumento']) {
      expect(bloqueiaAssinatura(perms({ [chave]: false })), chave).toBe(true);
    }
  });

  test('só impressão ou cópia negada -> não bloqueia (não é assinatura)', () => {
    expect(bloqueiaAssinatura(perms({ imprimir: false, copiarTexto: false }))).toBe(false);
  });
});

describe('validarCriptografia', () => {
  const ctx = (nome: string) =>
    montarContexto(nome, lerFixture(nome), 'application/pdf', CONFIG_PADRAO);

  test('PDF sem cifra -> nenhuma ocorrência', async () => {
    expect(validarCriptografia(await ctx('simples.pdf'))).toEqual([]);
  });

  test('cifra que proíbe assinar -> erro com /P e os bits negados no detalhe', async () => {
    const oc = validarCriptografia(await ctx('criptografado-sem-assinar.pdf'));
    expect(oc).toHaveLength(1);
    expect(oc[0]!.codigo).toBe('PDF_ASSINATURA_BLOQUEADA');
    expect(oc[0]!.gravidade).toBe('erro');
    expect(oc[0]!.correcaoDisponivel).toBe('REMOVER_CRIPTOGRAFIA');
    expect(oc[0]!.detalheTecnico).toContain('/P -1340');
    expect(oc[0]!.detalheTecnico).toContain('bit 9');
  });

  test('cifra permissiva -> nenhuma ocorrência', async () => {
    expect(validarCriptografia(await ctx('criptografado-permissivo.pdf'))).toEqual([]);
  });

  test('não se aplica a MP3/MP4 (ctx.pdf null)', async () => {
    const c = await montarContexto('audio.mp3', lerFixture('audio.mp3'), 'audio/mpeg', CONFIG_PADRAO);
    expect(validarCriptografia(c)).toEqual([]);
  });
});
