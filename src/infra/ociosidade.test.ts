import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { iniciarOciosidade } from './ociosidade';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('dispara onExpirar após o tempo sem atividade', () => {
  const expirou = vi.fn();
  iniciarOciosidade(expirou, 1000);
  vi.advanceTimersByTime(999);
  expect(expirou).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(expirou).toHaveBeenCalledTimes(1);
});

test('cutucar reinicia a contagem', () => {
  const expirou = vi.fn();
  const c = iniciarOciosidade(expirou, 1000);
  vi.advanceTimersByTime(800);
  c.cutucar();
  vi.advanceTimersByTime(800);
  expect(expirou).not.toHaveBeenCalled();
  vi.advanceTimersByTime(200);
  expect(expirou).toHaveBeenCalledTimes(1);
});

test('atividade do usuário (keydown) reinicia a contagem', () => {
  const expirou = vi.fn();
  iniciarOciosidade(expirou, 1000);
  vi.advanceTimersByTime(900);
  window.dispatchEvent(new KeyboardEvent('keydown'));
  vi.advanceTimersByTime(900);
  expect(expirou).not.toHaveBeenCalled();
});

test('parar impede o disparo', () => {
  const expirou = vi.fn();
  const c = iniciarOciosidade(expirou, 1000);
  c.parar();
  vi.advanceTimersByTime(5000);
  expect(expirou).not.toHaveBeenCalled();
});

test('dispara só uma vez', () => {
  const expirou = vi.fn();
  iniciarOciosidade(expirou, 1000);
  vi.advanceTimersByTime(5000);
  expect(expirou).toHaveBeenCalledTimes(1);
});
