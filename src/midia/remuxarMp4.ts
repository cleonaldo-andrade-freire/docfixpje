import {
  acharDescendentes,
  acharFilho,
  escreverU32,
  listarBoxes,
  parsearBoxes,
  serializar,
  tamanhoSerializado,
  u16,
  u32,
  AUDIO_SAMPLE_ENTRY_PREFIXO,
  CODECS_AUDIO,
  CODECS_VIDEO,
  type BoxBruto,
  type NoBox,
} from './isobmff';

/**
 * Remux QuickTime (.mov, e o .MP4 que na verdade é .mov) → MP4 ISO.
 *
 * Câmeras, celulares e o QuickTime da Apple gravam um container QuickTime e
 * salvam com extensão .mp4. O arquivo toca em qualquer player, mas o PJe
 * recusa: o demuxer dele exige ISO BMFF de verdade. As diferenças que importam
 * são todas de container — as amostras de vídeo (H.264) e de áudio (AAC) já são
 * as mesmas de um MP4.
 *
 * Por isso a conversão é um REMUX, não uma recodificação: os bytes de mídia são
 * copiados intactos. Não há perda de qualidade nem motor pesado envolvido, e um
 * arquivo de 200 MB sai em segundos.
 *
 * O que é reescrito (cada item é um motivo real de recusa):
 *   - `ftyp` com brand `qt  `      → `isom`/`iso2`/<codec>/`mp41`
 *   - `mp4a` versão 1 ou 2 (QT)    → versão 0, com o `esds` tirado de dentro do `wave`
 *   - `dref` com entradas `alis`   → uma entrada `url ` self-contained
 *   - `colr` tipo `nclc` (QT)      → `nclx` (mesma colorimetria, + full_range_flag)
 *   - boxes só-QuickTime (`tapt`, `fiel`, `chrm`, `gama`, o `hdlr` de `minf`…) → removidos
 *   - trilhas não-mídia (timecode, `text`) → removidas
 *   - `stco`/`co64`                → recalculados para o novo lugar do `mdat`
 */

/**
 * Codecs que o PJe aceita de fato.
 *
 * O remux monta um MP4 ISO válido para qualquer codec que o container comporte,
 * mas converter um HEVC não ajudaria: o PJe recusa do mesmo jeito, e o usuário
 * voltaria com um arquivo que esta ferramenta declarou pronto — que é
 * exatamente a falha que a Regra 4 existe para evitar. Vídeos de iPhone
 * recentes gravam em HEVC (`hvc1`), então este caso é comum, e a saída honesta
 * é recusar com orientação em vez de "corrigir" para nada.
 *
 * Restrição herdada dos testes no PJe real registrados em `remuxMp4.ts` da
 * branch `main`, consolidada aqui.
 */
const CODECS_VIDEO_ACEITOS = new Set(['avc1', 'avc3']);
const CODECS_AUDIO_ACEITOS = new Set(['mp4a']);

/** Sub-boxes de sample entry que o MP4 ISO conhece. O resto é lixo do QuickTime. */
const SUBBOX_SAMPLE_ENTRY = new Set([
  'avcC',
  'hvcC',
  'av1C',
  'vpcC',
  'esds',
  'pasp',
  'colr',
  'btrt',
  'clli',
  'mdcv',
  'dOps',
  'dac3',
  'dec3',
  'dfLa',
  'alac',
]);

/** Boxes do QuickTime (ou puramente decorativos) que não têm lugar num MP4. */
const REMOVER = new Set([
  'tapt',
  'gama',
  'fiel',
  'chrm',
  'smi ',
  'clip',
  'crgn',
  'matt',
  'kmat',
  'pnot',
  'ctab',
  'load',
  'imap',
  'meta',
  'udta',
  'free',
  'skip',
  'wide',
]);

export interface Trilha {
  /** handler da mdia: `vide`, `soun`, `tmcd`, … */
  midia: string;
  /** 4CC da primeira sample entry, ou '' se ilegível. */
  codec: string;
}

export interface AnaliseMidia {
  container: 'mp4' | 'quicktime' | 'desconhecido';
  /** Incompatibilidades com MP4 ISO. Vazio = o arquivo já está conforme. */
  problemas: string[];
  /** true se dá para converter só trocando o container, sem recodificar. */
  remuxavel: boolean;
  /** Preenchido quando `remuxavel` é false. */
  motivo: string | null;
  trilhas: Trilha[];
}

export type ResultadoRemux =
  | { ok: true; bytes: Uint8Array; problemasCorrigidos: string[] }
  | { ok: false; motivo: string };

function texto(bytes: Uint8Array, o: number, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[o + i] ?? 0);
  return s;
}

/** Brands que indicam QuickTime em vez de MP4 ISO. */
function ehBrandQuickTime(brand: string): boolean {
  const b = brand.trim().toLowerCase();
  return b === 'qt' || b === 'moov';
}

interface Estrutura {
  ftyp: BoxBruto | null;
  moov: BoxBruto | null;
  mdats: BoxBruto[];
  temFragmentos: boolean;
}

function lerEstrutura(bytes: Uint8Array): Estrutura {
  const topo = listarBoxes(bytes, 0, bytes.length);
  return {
    ftyp: topo.find((b) => b.tipo === 'ftyp') ?? null,
    moov: topo.find((b) => b.tipo === 'moov') ?? null,
    mdats: topo.filter((b) => b.tipo === 'mdat'),
    temFragmentos: topo.some((b) => b.tipo === 'moof'),
  };
}

/**
 * Diagnóstico do container, sem produzir arquivo. É o que o validador usa para
 * decidir entre "apto", "corrigível pelo remux" e "precisa recodificar fora".
 */
export function analisarMidia(bytes: Uint8Array): AnaliseMidia {
  const problemas: string[] = [];
  const trilhas: Trilha[] = [];
  const est = lerEstrutura(bytes);

  let container: AnaliseMidia['container'] = 'desconhecido';
  if (est.ftyp) {
    const brands: string[] = [];
    for (let o = est.ftyp.corpoInicio; o + 4 <= est.ftyp.fim; o += 4) brands.push(texto(bytes, o, 4));
    const major = brands[0] ?? '';
    container = ehBrandQuickTime(major) ? 'quicktime' : 'mp4';
    if (container === 'quicktime') {
      problemas.push(`container QuickTime: ftyp com major brand "${major}"`);
    }
  }

  const naoRemuxavel = (motivo: string): AnaliseMidia => ({
    container,
    problemas,
    remuxavel: false,
    motivo,
    trilhas,
  });

  if (!est.moov) return naoRemuxavel('o arquivo não tem box "moov" — está truncado ou não é MP4/MOV.');
  if (est.temFragmentos) {
    return naoRemuxavel('o arquivo é fragmentado (fMP4); esta ferramenta não remuxa fragmentos.');
  }
  if (est.mdats.length === 0) {
    return naoRemuxavel('o arquivo não tem box "mdat" — os dados de mídia não estão embutidos.');
  }

  const moov = { tipo: 'moov', prefixo: new Uint8Array(0), filhos: parsearBoxes(bytes, est.moov.corpoInicio, est.moov.fim) };

  for (const dref of acharDescendentes(moov, 'dref')) {
    for (const entrada of dref.filhos ?? []) {
      const autoContida = (u32(entrada.prefixo, 0) & 0x00ffffff) === 1;
      if (!autoContida) {
        return naoRemuxavel(
          'as trilhas apontam para arquivos externos (dref não self-contained); a mídia não está toda neste arquivo.',
        );
      }
      if (entrada.tipo !== 'url ') problemas.push(`referência de dados "${entrada.tipo}" (QuickTime) em vez de "url "`);
    }
  }

  let temMidia = false;
  for (const trak of moov.filhos?.filter((f) => f.tipo === 'trak') ?? []) {
    const mdia = acharFilho(trak, 'mdia');
    const hdlr = mdia && acharFilho(mdia, 'hdlr');
    const midia = hdlr ? texto(hdlr.prefixo, 8, 4) : '';
    const stsd = acharDescendentes(trak, 'stsd')[0];
    const entrada = stsd?.filhos?.[0];
    const codec = entrada?.tipo ?? '';
    trilhas.push({ midia, codec });

    if (midia !== 'vide' && midia !== 'soun') {
      problemas.push(`trilha "${midia || '?'}" não é áudio nem vídeo e será removida`);
      continue;
    }
    if (!CODECS_VIDEO.has(codec) && !CODECS_AUDIO.has(codec)) {
      return naoRemuxavel(
        `a trilha ${midia} usa o codec "${codec}", que não existe em MP4. É preciso recodificar o arquivo — o remux não resolve.`,
      );
    }
    const aceitos = midia === 'vide' ? CODECS_VIDEO_ACEITOS : CODECS_AUDIO_ACEITOS;
    if (!aceitos.has(codec)) {
      return naoRemuxavel(
        `a trilha ${midia} usa o codec "${codec}". Ele cabe num MP4, mas o PJe não aceita: ` +
          `remuxar produziria um arquivo conforme que ainda assim seria recusado. ` +
          `É preciso recodificar em ${midia === 'vide' ? 'H.264 (avc1)' : 'AAC (mp4a)'}.`,
      );
    }
    temMidia = true;

    if (CODECS_AUDIO.has(codec) && entrada) {
      const versao = u16(entrada.prefixo, 8);
      if (versao !== 0) problemas.push(`sample entry de áudio "${codec}" na versão ${versao} do QuickTime (MP4 exige 0)`);
      if (acharFilho(entrada, 'wave')) problemas.push('parâmetros do AAC dentro de um box "wave" do QuickTime');
    }
    for (const sub of entrada?.filhos ?? []) {
      if (sub.tipo === 'colr' && texto(sub.prefixo, 0, 4) === 'nclc') {
        problemas.push('box "colr" no formato "nclc" do QuickTime (MP4 usa "nclx")');
      }
    }
    for (const t of REMOVER) {
      if (acharDescendentes(trak, t).length > 0) problemas.push(`box "${t}" (QuickTime) presente na trilha`);
    }
  }

  if (!temMidia) return naoRemuxavel('o arquivo não tem nenhuma trilha de áudio ou vídeo utilizável.');

  return { container, problemas: [...new Set(problemas)], remuxavel: true, motivo: null, trilhas };
}

/** Converte o arquivo para MP4 ISO copiando as amostras intactas. */
export function remuxarParaMp4(bytes: Uint8Array): ResultadoRemux {
  const analise = analisarMidia(bytes);
  if (!analise.remuxavel) return { ok: false, motivo: analise.motivo ?? 'formato não suportado.' };

  const est = lerEstrutura(bytes);
  // analisarMidia já garantiu ambos; o if é só para o estreitamento de tipo.
  if (!est.moov || est.mdats.length === 0) return { ok: false, motivo: 'estrutura inesperada.' };

  const moov = sanear({
    tipo: 'moov',
    prefixo: new Uint8Array(0),
    filhos: parsearBoxes(bytes, est.moov.corpoInicio, est.moov.fim).filter(
      (f) => f.tipo !== 'trak' || manterTrilha(f),
    ),
  });

  const codecVideo = analise.trilhas.find((t) => t.midia === 'vide')?.codec ?? '';
  const ftyp = montarFtyp(codecVideo);

  // Layout de saída: ftyp + mdat (cópia literal) + moov. Como o mdat vem antes
  // do moov e é copiado sem alteração, o deslocamento de cada chunk é constante
  // e conhecido antes de serializar o moov.
  const inicioMdatDados = ftyp.length + 8;
  const remapear = montarRemapeador(est.mdats, inicioMdatDados);
  const erro = reescreverOffsets(moov, remapear);
  if (erro) return { ok: false, motivo: erro };

  const tamanhoMdat = est.mdats.reduce((n, m) => n + (m.fim - m.corpoInicio), 0);
  const moovBytes = serializar(moov);
  const total = ftyp.length + 8 + tamanhoMdat + moovBytes.length;

  const out = new Uint8Array(total);
  out.set(ftyp, 0);
  escreverU32(out, ftyp.length, 8 + tamanhoMdat);
  out.set([0x6d, 0x64, 0x61, 0x74], ftyp.length + 4); // 'mdat'
  let o = inicioMdatDados;
  for (const m of est.mdats) {
    out.set(bytes.subarray(m.corpoInicio, m.fim), o);
    o += m.fim - m.corpoInicio;
  }
  out.set(moovBytes, o);

  return { ok: true, bytes: out, problemasCorrigidos: analise.problemas };
}

function manterTrilha(trak: NoBox): boolean {
  const mdia = acharFilho(trak, 'mdia');
  const hdlr = mdia && acharFilho(mdia, 'hdlr');
  const midia = hdlr ? texto(hdlr.prefixo, 8, 4) : '';
  return midia === 'vide' || midia === 'soun';
}

/** Poda e normaliza a árvore do moov, recursivamente. */
function sanear(no: NoBox): NoBox {
  if (no.tipo === 'dref') return drefAutoContido();
  if (no.tipo === 'stsd') {
    return { ...no, filhos: (no.filhos ?? []).map((f) => sanearSampleEntry(f)) };
  }
  if (no.filhos === null) return no;

  const filhos = no.filhos
    .filter((f) => !REMOVER.has(f.tipo))
    // O `hdlr` dentro de `minf` é o data handler do QuickTime; em MP4 não existe.
    .filter((f) => !(no.tipo === 'minf' && f.tipo === 'hdlr'))
    .map((f) => sanear(f));

  return { ...no, filhos };
}

/** Uma única entrada `url ` self-contained — a forma canônica em MP4. */
function drefAutoContido(): NoBox {
  const prefixo = new Uint8Array(8);
  escreverU32(prefixo, 4, 1); // entry_count = 1
  const entrada: NoBox = { tipo: 'url ', prefixo: new Uint8Array([0, 0, 0, 1]), filhos: null };
  return { tipo: 'dref', prefixo, filhos: [entrada] };
}

function sanearSampleEntry(entrada: NoBox): NoBox {
  if (entrada.filhos === null) return entrada;

  let prefixo = entrada.prefixo;
  let filhos = entrada.filhos;

  if (CODECS_AUDIO.has(entrada.tipo)) {
    // O `wave` do QuickTime embrulha o `esds`; em MP4 ele é filho direto do mp4a.
    const wave = filhos.find((f) => f.tipo === 'wave');
    if (wave) {
      const esds = acharDescendentes(wave, 'esds')[0];
      filhos = [...filhos.filter((f) => f.tipo !== 'wave'), ...(esds ? [esds] : [])];
    }
    prefixo = audioSampleEntryV0(prefixo);
  }

  filhos = filhos.filter((f) => SUBBOX_SAMPLE_ENTRY.has(f.tipo)).map(normalizarSubBox);

  return { ...entrada, prefixo, filhos };
}

/**
 * Reduz um AudioSampleEntry v1/v2 do QuickTime ao v0 do MP4, preservando canais,
 * bits por amostra e taxa. Em v2 os campos legados vêm com valores fictícios e os
 * verdadeiros ficam na extensão — daí a leitura separada.
 */
function audioSampleEntryV0(prefixo: Uint8Array): Uint8Array {
  const versao = u16(prefixo, 8);
  if (versao === 0 && prefixo.length === AUDIO_SAMPLE_ENTRY_PREFIXO) return prefixo;

  let canais = u16(prefixo, 16);
  let bits = u16(prefixo, 18);
  let taxa = u32(prefixo, 24) >>> 16;

  if (versao === 2 && prefixo.length >= 48) {
    const vis = new DataView(prefixo.buffer, prefixo.byteOffset, prefixo.byteLength);
    taxa = Math.round(vis.getFloat64(32));
    canais = u32(prefixo, 40);
    bits = 16;
  }

  const out = new Uint8Array(AUDIO_SAMPLE_ENTRY_PREFIXO);
  out.set(prefixo.subarray(0, 8), 0); // reserved[6] + data_reference_index
  out[16] = (canais >> 8) & 0xff;
  out[17] = canais & 0xff;
  out[18] = (bits >> 8) & 0xff;
  out[19] = bits & 0xff;
  // compressionID e packetsize ficam em 0 (o QuickTime grava 0xFFFE em compressionID).
  escreverU32(out, 24, (Math.min(taxa, 0xffff) << 16) >>> 0);
  return out;
}

/** `colr` do QuickTime é `nclc` (3 campos); o do MP4 é `nclx` (+ full_range_flag). */
function normalizarSubBox(sub: NoBox): NoBox {
  if (sub.tipo !== 'colr' || texto(sub.prefixo, 0, 4) !== 'nclc') return sub;
  const out = new Uint8Array(11);
  out.set([0x6e, 0x63, 0x6c, 0x78], 0); // 'nclx'
  out.set(sub.prefixo.subarray(4, 10), 4); // primaries, transfer, matrix
  out[10] = 0; // full_range_flag = 0 (vídeo em faixa limitada, o padrão)
  return { ...sub, prefixo: out };
}

function montarFtyp(codecVideo: string): Uint8Array {
  const compat = ['isom', 'iso2'];
  if (codecVideo === 'avc1' || codecVideo === 'avc3') compat.push('avc1');
  else if (codecVideo === 'hvc1' || codecVideo === 'hev1') compat.push('hvc1');
  else if (codecVideo === 'av01') compat.push('av01');
  compat.push('mp41');

  const out = new Uint8Array(16 + compat.length * 4);
  escreverU32(out, 0, out.length);
  out.set([0x66, 0x74, 0x79, 0x70], 4); // 'ftyp'
  out.set([0x69, 0x73, 0x6f, 0x6d], 8); // major brand 'isom'
  escreverU32(out, 12, 0x200); // minor version
  compat.forEach((b, i) => {
    for (let j = 0; j < 4; j++) out[16 + i * 4 + j] = b.charCodeAt(j);
  });
  return out;
}

/**
 * Constrói a função que leva um offset de chunk do arquivo antigo para o novo.
 * Cada `mdat` é copiado inteiro, então dentro dele o deslocamento é constante.
 */
function montarRemapeador(mdats: BoxBruto[], inicioDestino: number): (o: number) => number | null {
  let destino = inicioDestino;
  const faixas = mdats.map((m) => {
    const faixa = { de: m.corpoInicio, ate: m.fim, delta: destino - m.corpoInicio };
    destino += m.fim - m.corpoInicio;
    return faixa;
  });
  return (o) => {
    for (const f of faixas) if (o >= f.de && o < f.ate) return o + f.delta;
    return null;
  };
}

/** Reescreve stco/co64 in place. Devolve uma mensagem de erro, ou null se deu certo. */
function reescreverOffsets(moov: NoBox, remapear: (o: number) => number | null): string | null {
  for (const stco of acharDescendentes(moov, 'stco')) {
    const n = u32(stco.prefixo, 4);
    const novo = new Uint8Array(stco.prefixo);
    for (let i = 0; i < n; i++) {
      const antigo = u32(novo, 8 + i * 4);
      const alvo = remapear(antigo);
      if (alvo === null) return 'há chunks de mídia fora do box "mdat"; o arquivo não segue o layout esperado.';
      escreverU32(novo, 8 + i * 4, alvo);
    }
    stco.prefixo = novo;
  }

  for (const co64 of acharDescendentes(moov, 'co64')) {
    const n = u32(co64.prefixo, 4);
    const novo = new Uint8Array(co64.prefixo);
    const vis = new DataView(novo.buffer, novo.byteOffset, novo.byteLength);
    for (let i = 0; i < n; i++) {
      const antigo = Number(vis.getBigUint64(8 + i * 8));
      const alvo = remapear(antigo);
      if (alvo === null) return 'há chunks de mídia fora do box "mdat"; o arquivo não segue o layout esperado.';
      vis.setBigUint64(8 + i * 8, BigInt(alvo));
    }
    co64.prefixo = novo;
  }

  // Guarda de sanidade: nenhum box da árvore pode ter estourado 4 GB.
  if (tamanhoSerializado(moov) > 0xffff_ffff) return 'o índice do arquivo é grande demais para ser reescrito.';
  return null;
}
