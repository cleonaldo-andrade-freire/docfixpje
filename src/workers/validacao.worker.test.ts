import { expect, test, vi } from 'vitest';
import { processarValidacao } from './validacao.worker';
import type { DoWorker } from './protocolo';
import { lerFixture } from '../../scripts/lib/ler-fixture';

const bufDe = (nome: string): ArrayBuffer => {
  const u8 = lerFixture(nome);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
};

test('emite etapas e um único resultado apto para PDF simples', async () => {
  const msgs: DoWorker[] = [];
  await processarValidacao(
    { tipo: 'validar', nomeArquivo: 'simples.pdf', buffer: bufDe('simples.pdf') },
    (m) => msgs.push(m),
  );
  const etapas = msgs.filter((m) => m.tipo === 'etapa');
  const resultados = msgs.filter((m) => m.tipo === 'resultado');
  expect(etapas.length).toBeGreaterThanOrEqual(1);
  expect(resultados).toHaveLength(1);
  expect(resultados[0]).toMatchObject({ tipo: 'resultado', resultado: { apto: true } });
});

test('PDF assinado -> resultado com ASSINATURA_PRESENTE', async () => {
  const msgs: DoWorker[] = [];
  await processarValidacao(
    { tipo: 'validar', nomeArquivo: 'assinado.pdf', buffer: bufDe('assinado.pdf') },
    (m) => msgs.push(m),
  );
  const r = msgs.find((m) => m.tipo === 'resultado');
  expect(r && r.tipo === 'resultado' && r.resultado.ocorrencias.map((o) => o.codigo)).toContain(
    'ASSINATURA_PRESENTE',
  );
});

test('exceção inesperada vira mensagem de erro, não throw', async () => {
  const msgs: DoWorker[] = [];
  const bufferRuim = { byteLength: 0 } as unknown as ArrayBuffer;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await processarValidacao(
    { tipo: 'validar', nomeArquivo: 'x', buffer: bufferRuim },
    (m) => msgs.push(m),
  );
  // pode resolver como resultado (FORMATO_NAO_SUPORTADO) ou como erro; nunca lançar
  expect(msgs.length).toBeGreaterThanOrEqual(1);
});
