import { expect, test, vi } from 'vitest';
import { executarComTimeout, TIMEOUT } from './executarComTimeout';

test('resolve com o valor quando a promessa termina antes do prazo', async () => {
  const r = await executarComTimeout(Promise.resolve(42), 1000, () => {});
  expect(r).toBe(42);
});

test('estoura -> TIMEOUT e chama aoEstourar uma vez', async () => {
  vi.useFakeTimers();
  const aoEstourar = vi.fn();
  const nuncaResolve = new Promise<number>(() => {});
  const p = executarComTimeout(nuncaResolve, 10, aoEstourar);
  await vi.advanceTimersByTimeAsync(10);
  expect(await p).toBe(TIMEOUT);
  expect(aoEstourar).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

test('promessa que rejeita -> TIMEOUT, sem lançar', async () => {
  const r = await executarComTimeout(Promise.reject(new Error('x')), 1000, () => {});
  expect(r).toBe(TIMEOUT);
});
