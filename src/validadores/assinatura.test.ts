import { expect, test } from 'vitest';
import { montarContexto } from './contexto';
import { validarAssinatura } from './assinatura';
import type { TipoDetectado } from '../tipos';
import { lerFixture } from '../../scripts/lib/ler-fixture';

const fx = new Proxy({} as Record<string, Uint8Array>, {
  get: (_t, p) => lerFixture(String(p)),
});

const ctxDe = (nome: string, tipo: TipoDetectado) =>
  montarContexto(nome, fx[nome]!, tipo);

test('PDF assinado -> ASSINATURA_PRESENTE erro, com nome do campo e correção', async () => {
  const oc = validarAssinatura(await ctxDe('assinado.pdf', 'application/pdf'));
  const a = oc.find((o) => o.codigo === 'ASSINATURA_PRESENTE');
  expect(a?.gravidade).toBe('erro');
  expect(a?.detalheTecnico).toMatch(/Signature1/);
  expect(a?.correcaoDisponivel).toBe('REMOVER_ASSINATURA');
});

test('campo de assinatura vazio -> aviso, sem erro', async () => {
  const oc = validarAssinatura(await ctxDe('campo-sig-vazio.pdf', 'application/pdf'));
  expect(oc.map((o) => o.codigo)).toEqual(['CAMPO_ASSINATURA_VAZIO']);
  expect(oc[0]!.gravidade).toBe('aviso');
});

test('PDF simples -> nenhuma ocorrência', async () => {
  expect(validarAssinatura(await ctxDe('simples.pdf', 'application/pdf'))).toEqual([]);
});

test('MP3 -> nenhuma ocorrência (regra não se aplica)', async () => {
  expect(validarAssinatura(await ctxDe('audio.mp3', 'audio/mpeg'))).toEqual([]);
});

test('PDF com /Perms /DocMDP -> ASSINATURA_PRESENTE + RESTRICAO_DOCMDP', async () => {
  const cod = validarAssinatura(await ctxDe('docmdp.pdf', 'application/pdf')).map((o) => o.codigo);
  expect(cod).toContain('ASSINATURA_PRESENTE');
  expect(cod).toContain('RESTRICAO_DOCMDP');
});
