import { expect, test } from 'vitest';
import { transicionar, transicaoValida, TEXTO_ESTADO, TRANSICOES } from './maquinaLinha';

test('caminho feliz da validação', () => {
  expect(transicionar('aguardando', 'validando')).toBe('validando');
  expect(transicionar('validando', 'apto')).toBe('apto');
  expect(transicionar('validando', 'inapto')).toBe('inapto');
});

test('caminho da correção', () => {
  expect(transicionar('inapto', 'corrigindo')).toBe('corrigindo');
  expect(transicionar('corrigindo', 'corrigido')).toBe('corrigido');
  expect(transicionar('corrigindo', 'correcao_falhou')).toBe('correcao_falhou');
  expect(transicionar('corrigindo', 'nao_corrigivel')).toBe('nao_corrigivel');
});

test('transição inválida lança em desenvolvimento', () => {
  expect(() => transicionar('aguardando', 'corrigido')).toThrow(/transição inválida/);
  expect(() => transicionar('apto', 'validando')).toThrow(/transição inválida/);
});

test('estados terminais não têm saída', () => {
  for (const t of ['apto', 'corrigido', 'correcao_falhou', 'nao_corrigivel'] as const) {
    expect(TRANSICOES[t]).toEqual([]);
  }
});

test('transicaoValida não lança', () => {
  expect(transicaoValida('aguardando', 'corrigido')).toBe(false);
  expect(transicaoValida('aguardando', 'validando')).toBe(true);
});

test('textos literais da spec §6', () => {
  expect(TEXTO_ESTADO.aguardando).toBe('Aguardando validação');
  expect(TEXTO_ESTADO.apto).toBe('Pronto para anexar ao PJe');
  expect(TEXTO_ESTADO.corrigido).toBe('Corrigido — revalidado com sucesso');
});
