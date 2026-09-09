import { listarCaixas, encontrarCaixasPorTipo } from './caixasMp4';

const b = (...arr: number[]) => new Uint8Array(arr);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const u32 = (n: number) => b((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
function concat(...parts: Uint8Array[]) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
function caixa(tipo: string, ...conteudo: Uint8Array[]) {
  const corpo = concat(...conteudo);
  return concat(u32(8 + corpo.length), ascii(tipo), corpo);
}

test('lista caixas de nível único (ftyp, moov, mdat)', () => {
  const buf = concat(caixa('ftyp', ascii('qt  '), b(0, 0, 0, 0)), caixa('moov'), caixa('mdat', b(1, 2, 3)));
  const caixas = listarCaixas(buf);
  expect(caixas.map((c) => c.tipo)).toEqual(['ftyp', 'moov', 'mdat']);
  expect(caixas[0]).toEqual({ tipo: 'ftyp', offset: 0, tamanho: 16, tamanhoCabecalho: 8 });
  expect(caixas[2]).toEqual({ tipo: 'mdat', offset: 24, tamanho: 11, tamanhoCabecalho: 8 });
});

test('size 0 significa "até o fim do intervalo"', () => {
  const buf = concat(u32(0), ascii('mdat'), b(1, 2, 3, 4, 5));
  const caixas = listarCaixas(buf);
  expect(caixas).toEqual([{ tipo: 'mdat', offset: 0, tamanho: 13, tamanhoCabecalho: 8 }]);
});

test('size 1 usa tamanho estendido de 64 bits (header de 16 bytes)', () => {
  const buf = concat(u32(1), ascii('mdat'), u32(0), u32(24), b(9, 9, 9, 9, 9, 9, 9, 9));
  const caixas = listarCaixas(buf);
  expect(caixas).toEqual([{ tipo: 'mdat', offset: 0, tamanho: 24, tamanhoCabecalho: 16 }]);
});

test('caixa malformada (tamanho menor que o cabeçalho) interrompe a listagem sem lançar', () => {
  const buf = concat(caixa('ftyp', ascii('qt  '), b(0, 0, 0, 0)), u32(4), ascii('xxxx'));
  const caixas = listarCaixas(buf);
  expect(caixas.map((c) => c.tipo)).toEqual(['ftyp']);
});

test('aceita um intervalo [inicio, fim) dentro de um buffer maior', () => {
  const buf = concat(caixa('ftyp', ascii('qt  '), b(0, 0, 0, 0)), caixa('trak'), caixa('mdat', b(1)));
  const caixas = listarCaixas(buf, 16, 16 + 8);
  expect(caixas.map((c) => c.tipo)).toEqual(['trak']);
});

test('encontrarCaixasPorTipo desce por moov/trak/mdia/minf/stbl e acha caixas-folha', () => {
  const stco = caixa('stco', b(9));
  const arvore = caixa('moov', caixa('trak', caixa('mdia', caixa('minf', caixa('stbl', stco)))));
  const buf = concat(caixa('ftyp', ascii('qt  '), b(0, 0, 0, 0)), arvore, caixa('mdat', b(1)));

  const achadas = encontrarCaixasPorTipo(buf, new Set(['stco']));
  expect(achadas).toHaveLength(1);
  expect(achadas[0]?.tipo).toBe('stco');
});

test('encontrarCaixasPorTipo não desce dentro de mdat (evita interpretar payload como caixas)', () => {
  // Payload de mdat que por acaso "parece" uma caixa stco não deve ser encontrado.
  const payloadParecido = caixa('stco', b(9));
  const buf = concat(caixa('ftyp', ascii('qt  '), b(0, 0, 0, 0)), caixa('mdat', payloadParecido));

  const achadas = encontrarCaixasPorTipo(buf, new Set(['stco']));
  expect(achadas).toHaveLength(0);
});
