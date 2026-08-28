import { gerarTodas } from './gerar-fixtures';
import { detectarTipo } from '../src/deteccao/detectarTipo';
import { varrerTrailerBruto } from '../src/pdf/estrutura';

let fixtures: Record<string, Uint8Array>;

beforeAll(async () => {
  fixtures = await gerarTodas();
}, 60_000);

test('gera todas as fixtures esperadas', () => {
  const esperadas = [
    'simples.pdf',
    'simples-sem-pdfa.pdf',
    'assinado.pdf',
    'assinado-e-sem-pdfa.pdf',
    'campo-sig-vazio.pdf',
    'docmdp.pdf',
    'pdfa-1b.pdf',
    'pdfa-2b-transparencia.pdf',
    'declara-a1b-sem-oi.pdf',
    'fonte-nao-embutida.pdf',
    'criptografado.pdf',
    'corrompido.pdf',
    'falso.pdf',
    'limite-exato.pdf',
    'acima-limite.pdf',
    'imagens-pesadas.pdf',
    'audio.mp3',
    'audio-grande.mp3',
    'video.mp4',
    'video-grande.mp4',
  ];
  expect(Object.keys(fixtures).sort()).toEqual([...esperadas].sort());
});

test('cada fixture tem o magic number do seu tipo', () => {
  const pdfs = Object.keys(fixtures).filter((n) => n.endsWith('.pdf') && n !== 'falso.pdf');
  for (const n of pdfs) {
    expect(detectarTipo(fixtures[n]!.subarray(0, 2048)), `magic de ${n}`).toBe('application/pdf');
  }
  expect(detectarTipo(fixtures['audio.mp3']!)).toBe('audio/mpeg');
  expect(detectarTipo(fixtures['audio-grande.mp3']!)).toBe('audio/mpeg');
  expect(detectarTipo(fixtures['video.mp4']!)).toBe('video/mp4');
  expect(detectarTipo(fixtures['video-grande.mp4']!)).toBe('video/mp4');
  expect(detectarTipo(fixtures['falso.pdf']!)).toBeNull();
});

test('fixtures de fronteira têm o tamanho exato', () => {
  expect(fixtures['limite-exato.pdf']!.length).toBe(10_485_760);
  expect(fixtures['acima-limite.pdf']!.length).toBe(10_485_761);
});

test('mídia grande passa de 10 MiB; mídia pequena não', () => {
  expect(fixtures['audio-grande.mp3']!.length).toBeGreaterThan(10_485_760);
  expect(fixtures['video-grande.mp4']!.length).toBeGreaterThan(10_485_760);
  expect(fixtures['audio.mp3']!.length).toBeLessThan(10_485_760);
  expect(fixtures['video.mp4']!.length).toBeLessThan(10_485_760);
});

test('assinado.pdf tem ByteRange+Contents e SigFlags 3', () => {
  const t = varrerTrailerBruto(fixtures['assinado.pdf']!);
  expect(t.temByteRangeEContents).toBe(true);
  expect(t.sigFlags).toBe(3);
  expect(t.nomesCamposSig).toContain('Signature1');
  expect(t.camposSigComV).toBeGreaterThanOrEqual(1);
});

test('campo-sig-vazio.pdf tem campo /FT /Sig sem /V e SigFlags 1', () => {
  const t = varrerTrailerBruto(fixtures['campo-sig-vazio.pdf']!);
  expect(t.temByteRangeEContents).toBe(false);
  expect(t.sigFlags).toBe(1);
  expect(t.nomesCamposSig).toContain('Assinatura1');
  expect(t.camposSigComV).toBe(0);
});

test('docmdp.pdf sinaliza /Perms e /DocMDP', () => {
  const t = varrerTrailerBruto(fixtures['docmdp.pdf']!);
  expect(t.temPerms).toBe(true);
  expect(t.temDocMDP).toBe(true);
});

test('criptografado.pdf tem /Encrypt no conteúdo', () => {
  const t = varrerTrailerBruto(fixtures['criptografado.pdf']!);
  expect(t.temEncrypt).toBe(true);
});

test('simples.pdf não tem nenhum sinal de assinatura', () => {
  const t = varrerTrailerBruto(fixtures['simples.pdf']!);
  expect(t.temByteRangeEContents).toBe(false);
  expect(t.temEncrypt).toBe(false);
  expect(t.temAcroForm).toBe(false);
  expect(t.nomesCamposSig).toEqual([]);
});
