import { describe, expect, test } from 'vitest';
import { analisarMidia, remuxarParaMp4 } from './remuxarMp4';
import { detectarTipo } from '../deteccao/detectarTipo';
import { acharDescendentes, listarBoxes, parsearBoxes, u16, u32 } from './isobmff';
import { lerFixture } from '../../scripts/lib/ler-fixture';

const fx = (nome: string) => lerFixture(nome);

function topo(bytes: Uint8Array): string[] {
  return listarBoxes(bytes, 0, bytes.length).map((b) => b.tipo);
}

function moovDe(bytes: Uint8Array) {
  const b = listarBoxes(bytes, 0, bytes.length).find((x) => x.tipo === 'moov')!;
  return { tipo: 'moov', prefixo: new Uint8Array(0), filhos: parsearBoxes(bytes, b.corpoInicio, b.fim) };
}

/**
 * Extrai as amostras de cada trilha a partir de stsc/stsz/stco. É assim que um
 * player acha os bytes de mídia — e é o que precisa continuar apontando para o
 * mesmo conteúdo depois do remux.
 */
function amostras(bytes: Uint8Array): Map<string, Uint8Array[]> {
  const out = new Map<string, Uint8Array[]>();
  const moov = moovDe(bytes);

  for (const trak of moov.filhos!.filter((f) => f.tipo === 'trak')) {
    const hdlr = acharDescendentes(trak, 'hdlr')[0]!;
    let midia = '';
    for (let i = 0; i < 4; i++) midia += String.fromCharCode(hdlr.prefixo[8 + i] ?? 0);

    const stsz = acharDescendentes(trak, 'stsz')[0]!;
    const stco = acharDescendentes(trak, 'stco')[0]!;
    const stsc = acharDescendentes(trak, 'stsc')[0]!;

    const tamFixo = u32(stsz.prefixo, 4);
    const n = u32(stsz.prefixo, 8);
    const tamanhos = Array.from({ length: n }, (_, i) =>
      tamFixo === 0 ? u32(stsz.prefixo, 12 + i * 4) : tamFixo,
    );

    const nChunks = u32(stco.prefixo, 4);
    const offsets = Array.from({ length: nChunks }, (_, i) => u32(stco.prefixo, 8 + i * 4));

    const nEntradas = u32(stsc.prefixo, 4);
    const entradas = Array.from({ length: nEntradas }, (_, i) => ({
      primeiro: u32(stsc.prefixo, 8 + i * 12),
      porChunk: u32(stsc.prefixo, 12 + i * 12),
    }));

    const lista: Uint8Array[] = [];
    let s = 0;
    for (let c = 0; c < nChunks && s < n; c++) {
      let porChunk = entradas[0]!.porChunk;
      for (const e of entradas) if (c + 1 >= e.primeiro) porChunk = e.porChunk;
      let off = offsets[c]!;
      for (let k = 0; k < porChunk && s < n; k++) {
        lista.push(bytes.subarray(off, off + tamanhos[s]!));
        off += tamanhos[s]!;
        s++;
      }
    }
    out.set(midia, lista);
  }
  return out;
}

describe('análise de container', () => {
  test('MP4 ISO limpo não acusa problema nenhum', () => {
    const a = analisarMidia(fx('video.mp4'));
    expect(a.container).toBe('mp4');
    expect(a.remuxavel).toBe(true);
    expect(a.problemas).toEqual([]);
  });

  test('QuickTime lista as incompatibilidades que fazem o PJe recusar', () => {
    const a = analisarMidia(fx('video-quicktime.mp4'));
    expect(a.container).toBe('quicktime');
    expect(a.remuxavel).toBe(true);
    expect(a.problemas.join('\n')).toMatch(/major brand "qt/);
    expect(a.problemas.join('\n')).toMatch(/alis/);
    expect(a.problemas.join('\n')).toMatch(/versão 1 do QuickTime/);
    expect(a.problemas.join('\n')).toMatch(/wave/);
    expect(a.problemas.join('\n')).toMatch(/nclc/);
    expect(a.trilhas.map((t) => `${t.midia}/${t.codec}`)).toEqual(['vide/avc1', 'soun/mp4a']);
  });

  test('arquivo sem trilha de mídia não é remuxável', () => {
    const a = analisarMidia(fx('video-sem-trilha.mp4'));
    expect(a.remuxavel).toBe(false);
    expect(a.motivo).toMatch(/trilha/);
  });

  // O remux montaria um MP4 ISO perfeito com a trilha HEVC dentro — e o PJe
  // recusaria assim mesmo. Dizer "corrigido" aqui seria mentir para o usuário.
  test('HEVC é recusado, mesmo sendo remuxável do ponto de vista do container', () => {
    const a = analisarMidia(fx('video-quicktime-hevc.mp4'));
    expect(a.remuxavel).toBe(false);
    expect(a.motivo).toMatch(/hvc1/);
    expect(a.motivo).toMatch(/H\.264/);
    expect(a.trilhas.some((t) => t.codec === 'hvc1')).toBe(true);
  });
});

describe('remux QuickTime -> MP4', () => {
  const original = () => fx('video-quicktime.mp4');

  test('produz um arquivo que a detecção reconhece como MP4', () => {
    const r = remuxarParaMp4(original());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(detectarTipo(r.bytes.subarray(0, 4096))).toBe('video/mp4');
    expect(analisarMidia(r.bytes).problemas).toEqual([]);
  });

  test('layout de saída é ftyp + mdat + moov', () => {
    const r = remuxarParaMp4(original());
    if (!r.ok) throw new Error(r.motivo);
    expect(topo(r.bytes)).toEqual(['ftyp', 'mdat', 'moov']);
  });

  // O coração da correção: o remux NÃO recodifica. Se um único byte de mídia
  // mudar, a "conversão sem perda" virou mentira.
  test('as amostras de áudio e vídeo continuam idênticas byte a byte', () => {
    const antes = amostras(original());
    const r = remuxarParaMp4(original());
    if (!r.ok) throw new Error(r.motivo);
    const depois = amostras(r.bytes);

    expect([...depois.keys()].sort()).toEqual(['soun', 'vide']);
    for (const [midia, lista] of depois) {
      const anterior = antes.get(midia)!;
      expect(lista.length, midia).toBe(anterior.length);
      lista.forEach((amostra, i) => {
        expect(Array.from(amostra), `${midia}[${i}]`).toEqual(Array.from(anterior[i]!));
      });
    }
  });

  test('o mdat inteiro é copiado sem alteração', () => {
    const orig = original();
    const mdatAntes = listarBoxes(orig, 0, orig.length).find((b) => b.tipo === 'mdat')!;
    const r = remuxarParaMp4(orig);
    if (!r.ok) throw new Error(r.motivo);
    const mdatDepois = listarBoxes(r.bytes, 0, r.bytes.length).find((b) => b.tipo === 'mdat')!;
    expect(Array.from(r.bytes.subarray(mdatDepois.corpoInicio, mdatDepois.fim))).toEqual(
      Array.from(orig.subarray(mdatAntes.corpoInicio, mdatAntes.fim)),
    );
  });

  test('mp4a volta para a versão 0, com o esds fora do wave', () => {
    const r = remuxarParaMp4(original());
    if (!r.ok) throw new Error(r.motivo);
    const moov = moovDe(r.bytes);
    const mp4a = acharDescendentes(moov, 'mp4a')[0]!;

    expect(u16(mp4a.prefixo, 8)).toBe(0); // version
    expect(mp4a.prefixo.length).toBe(28);
    expect(u16(mp4a.prefixo, 16)).toBe(2); // canais
    expect(u32(mp4a.prefixo, 24) >>> 16).toBe(44100);
    expect(mp4a.filhos!.map((f) => f.tipo)).toEqual(['esds']);
    expect(acharDescendentes(moov, 'wave')).toEqual([]);
  });

  test('dref alis vira url self-contained', () => {
    const r = remuxarParaMp4(original());
    if (!r.ok) throw new Error(r.motivo);
    const moov = moovDe(r.bytes);
    for (const dref of acharDescendentes(moov, 'dref')) {
      expect(dref.filhos!.map((f) => f.tipo)).toEqual(['url ']);
      expect(u32(dref.filhos![0]!.prefixo, 0) & 0xffffff).toBe(1);
    }
    expect(acharDescendentes(moov, 'alis')).toEqual([]);
  });

  test('colr nclc vira nclx preservando a colorimetria', () => {
    const r = remuxarParaMp4(original());
    if (!r.ok) throw new Error(r.motivo);
    const colr = acharDescendentes(moovDe(r.bytes), 'colr')[0]!;
    expect(String.fromCharCode(...colr.prefixo.subarray(0, 4))).toBe('nclx');
    expect(u16(colr.prefixo, 4)).toBe(1); // primaries
    expect(u16(colr.prefixo, 6)).toBe(1); // transfer
    expect(u16(colr.prefixo, 8)).toBe(1); // matrix
    expect(colr.prefixo[10]).toBe(0); // full_range_flag
  });

  test('boxes só-QuickTime somem do arquivo', () => {
    const r = remuxarParaMp4(original());
    if (!r.ok) throw new Error(r.motivo);
    const moov = moovDe(r.bytes);
    for (const tipo of ['tapt', 'fiel', 'chrm', 'wave', 'alis']) {
      expect(acharDescendentes(moov, tipo), tipo).toEqual([]);
    }
    // O `hdlr` de data handler do minf também: sobra um por trilha, o da mdia.
    expect(acharDescendentes(moov, 'hdlr')).toHaveLength(2);
  });

  test('remuxar um QuickTime dá exatamente o MP4 que o gerador produz nativamente', () => {
    const r = remuxarParaMp4(fx('video-quicktime.mp4'));
    if (!r.ok) throw new Error(r.motivo);
    expect(Array.from(r.bytes)).toEqual(Array.from(fx('video.mp4')));
  });

  test('só trilha de vídeo também remuxa', () => {
    const r = remuxarParaMp4(fx('video-quicktime-so-video.mp4'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...amostras(r.bytes).keys()]).toEqual(['vide']);
  });

  test('arquivo sem trilha não remuxa e explica o motivo', () => {
    const r = remuxarParaMp4(fx('video-sem-trilha.mp4'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toMatch(/trilha/);
  });

  test('lixo que não é MP4 não quebra o remuxador', () => {
    const r = remuxarParaMp4(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]));
    expect(r.ok).toBe(false);
  });
});
