import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { criarDownload, descartar, descartarTudo, contarAtivos } from './blobRegistry';

let criados: string[];
let revogados: string[];

beforeEach(() => {
  criados = [];
  revogados = [];
  let n = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => {
      const u = `blob:teste/${++n}`;
      criados.push(u);
      return u;
    }),
    revokeObjectURL: vi.fn((u: string) => {
      revogados.push(u);
    }),
  });
});

afterEach(() => {
  descartarTudo();
  vi.unstubAllGlobals();
});

const blob = () => new Blob(['x']);

test('criarDownload cria uma URL e registra', () => {
  criarDownload('a', blob(), 'a.pdf');
  expect(criados).toHaveLength(1);
  expect(contarAtivos()).toBe(1);
});

test('recriar o mesmo id revoga o anterior', () => {
  criarDownload('a', blob(), 'a.pdf');
  criarDownload('a', blob(), 'a.pdf');
  expect(revogados).toEqual([criados[0]]);
  expect(contarAtivos()).toBe(1);
});

test('descartarTudo revoga todas e zera', () => {
  criarDownload('a', blob(), 'a.pdf');
  criarDownload('b', blob(), 'b.pdf');
  criarDownload('c', blob(), 'c.pdf');
  descartarTudo();
  expect(revogados.sort()).toEqual([...criados].sort());
  expect(contarAtivos()).toBe(0);
});

test('descartar por id revoga só aquele', () => {
  criarDownload('a', blob(), 'a.pdf');
  criarDownload('b', blob(), 'b.pdf');
  descartar('a');
  expect(revogados).toEqual([criados[0]]);
  expect(contarAtivos()).toBe(1);
});

test('cada blob criado é revogado exatamente uma vez (spec §14.4)', () => {
  criarDownload('a', blob(), 'a.pdf');
  criarDownload('b', blob(), 'b.pdf');
  descartarTudo();
  descartarTudo(); // idempotente
  for (const u of criados) {
    expect(revogados.filter((r) => r === u)).toHaveLength(1);
  }
});
