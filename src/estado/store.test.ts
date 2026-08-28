import { expect, test } from 'vitest';
import { reducer, estadoInicial, type ItemArquivo, type EstadoStore } from './store';
import type { ResultadoValidacao } from '../tipos';

const item = (id: string): ItemArquivo => ({
  id,
  file: new File([new Uint8Array([1])], `${id}.pdf`),
  tipoRapido: 'application/pdf',
  estado: 'aguardando',
  etapa: null,
  resultado: null,
  resultadoCorrecao: null,
  orientacaoCorrecao: null,
  correcao: null,
});

const com = (...itens: ItemArquivo[]): EstadoStore => ({ ...estadoInicial, itens });

test('adicionar acrescenta itens e limpa recusa/ocioso', () => {
  const e = reducer({ ...estadoInicial, recusa: 'x', ocioso: true }, { t: 'adicionar', itens: [item('a')] });
  expect(e.itens).toHaveLength(1);
  expect(e.recusa).toBeNull();
  expect(e.ocioso).toBe(false);
});

test('remover tira por id', () => {
  const e = reducer(com(item('a'), item('b')), { t: 'remover', id: 'a' });
  expect(e.itens.map((i) => i.id)).toEqual(['b']);
});

test('limparTudo esvazia', () => {
  expect(reducer(com(item('a'), item('b')), { t: 'limparTudo' }).itens).toEqual([]);
});

test('ociosidadeExpirou esvazia e marca ocioso', () => {
  const e = reducer(com(item('a')), { t: 'ociosidadeExpirou' });
  expect(e.itens).toEqual([]);
  expect(e.ocioso).toBe(true);
});

test('estado usa a máquina de transições; inválida lança em dev', () => {
  const e = reducer(com(item('a')), { t: 'estado', id: 'a', estado: 'validando' });
  expect(e.itens[0]!.estado).toBe('validando');
  expect(() => reducer(com(item('a')), { t: 'estado', id: 'a', estado: 'corrigido' })).toThrow(
    /transição inválida/,
  );
});

test('resultado guarda o objeto e zera a etapa; não muda o estado', () => {
  const r = { apto: true, ocorrencias: [] } as unknown as ResultadoValidacao;
  const base = reducer(com(item('a')), { t: 'estado', id: 'a', estado: 'validando' });
  const e = reducer(base, { t: 'resultado', id: 'a', resultado: r });
  expect(e.itens[0]!.resultado).toBe(r);
  expect(e.itens[0]!.etapa).toBeNull();
  expect(e.itens[0]!.estado).toBe('validando');
});
