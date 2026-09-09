import { listarCaixas, encontrarCaixasPorTipo, type CaixaMp4 } from '../deteccao/caixasMp4';

/**
 * Remux de contêiner QuickTime (`ftyp` brand "qt") para MP4/ISO padrão, sem
 * recodificar vídeo/áudio (§16.6). O PJe recusa vídeos de iPhone/WhatsApp
 * cuja extensão é .mp4 mas o contêiner interno é QuickTime — mesmo depois de
 * só trocar o `ftyp` e ajustar `stco`/`co64` (comprovado testando no PJe de
 * verdade). O que resolve é reconstruir o `moov` do zero descartando as
 * extensões específicas do QuickTime que um mp4 "puro" nunca tem: `tapt`
 * (dentro de `trak`), `fiel`/`chrm` (dentro da sample entry de vídeo em
 * `stsd`) e `meta` (filho direto de `moov`, com `hdlr`/`keys`/`ilst`, no
 * formato antigo da Apple, sem version/flags como o `meta` do ISO). `mdat`
 * (as amostras de vídeo/áudio) nunca é tocado — mesmos bytes, sem
 * recodificar, sem `ffmpeg.wasm`, sem worker.
 */

export interface ResultadoRemux {
  ok: boolean;
  bytes: Uint8Array | null;
  motivo: string | null;
}

/** Mesmas brands dos arquivos "-convertido" já aceitos pelo PJe (§16.6). */
const BRANDS_COMPATIVEIS = ['isom', 'iso2', 'avc1', 'mp41'];

const TIPOS_OFFSET = new Set(['stco', 'co64']);

/** Containers que descemos para reconstruir moov (mp4/mov não fragmentado). */
const CONTAINERES_RECURSIVOS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);

/**
 * Caixas específicas do QuickTime, sem equivalente/necessidade no ISO,
 * descartadas onde aparecerem dentro de moov. `tapt` fica dentro de `trak`;
 * `meta` (com `hdlr`/`keys`/`ilst`) é filho direto de `moov`, no formato
 * antigo da Apple (sem version/flags, ao contrário do `meta` do ISO).
 */
const CAIXAS_QUICKTIME_DESCARTAR = new Set(['tapt', 'meta']);

/** Caixas de configuração da sample entry de vídeo que só existem no QuickTime. */
const CONFIG_AMOSTRA_VIDEO_DESCARTAR = new Set(['fiel', 'chrm']);

/** Tamanho fixo do VisualSampleEntry (ISO 14496-12 §12.1.3), após o cabeçalho size+type da entrada. */
const TAMANHO_FIXO_VISUAL_SAMPLE_ENTRY = 78;

function paraAscii(s: string): Uint8Array {
  return new Uint8Array([...s].map((c) => c.charCodeAt(0)));
}

function textoAscii(bytes: Uint8Array, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[offset + i] ?? 0);
  return s;
}

function falha(motivo: string): ResultadoRemux {
  return { ok: false, bytes: null, motivo };
}

function concatUint8(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Monta uma caixa a partir do tipo e das partes do corpo já serializadas. */
function construirCaixa(tipo: string, partesDoCorpo: Uint8Array[]): Uint8Array {
  const corpo = concatUint8(partesDoCorpo);
  const tamanho = 8 + corpo.length;
  const out = new Uint8Array(tamanho);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, tamanho);
  out.set(paraAscii(tipo), 4);
  out.set(corpo, 8);
  return out;
}

function construirFtypIsom(): Uint8Array {
  const partes = [paraAscii('isom'), new Uint8Array([0, 0, 2, 0]), ...BRANDS_COMPATIVEIS.map(paraAscii)];
  return construirCaixa('ftyp', partes);
}

/** stsd: version+flags(4) + entry_count(4) + entradas (cada uma é, ela mesma, uma "caixa" size+formato+corpo). */
function reconstruirStsd(bytes: Uint8Array, caixa: CaixaMp4): Uint8Array {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const inicioCorpo = caixa.offset + caixa.tamanhoCabecalho;
  const cabecalhoFixo = bytes.slice(inicioCorpo, inicioCorpo + 8); // version/flags + entry_count, sem mudança
  const contagem = dv.getUint32(inicioCorpo + 4);

  let p = inicioCorpo + 8;
  const entradas: Uint8Array[] = [];
  for (let i = 0; i < contagem; i++) {
    const tamanhoEntrada = dv.getUint32(p);
    if (tamanhoEntrada < 8) throw new Error('sample entry malformada em stsd');
    const formato = textoAscii(bytes, p + 4, 4);
    entradas.push(
      formato === 'avc1'
        ? reconstruirAmostraVideo(bytes, p, tamanhoEntrada, formato)
        : bytes.slice(p, p + tamanhoEntrada),
    );
    p += tamanhoEntrada;
  }
  return construirCaixa('stsd', [cabecalhoFixo, ...entradas]);
}

/** Sample entry de vídeo (avc1): cabeçalho fixo do VisualSampleEntry + caixas de configuração (avcC, colr, ...). */
function reconstruirAmostraVideo(
  bytes: Uint8Array,
  offsetEntrada: number,
  tamanhoEntrada: number,
  formato: string,
): Uint8Array {
  const inicioFixo = offsetEntrada + 8;
  const fimFixo = inicioFixo + TAMANHO_FIXO_VISUAL_SAMPLE_ENTRY;
  if (fimFixo > offsetEntrada + tamanhoEntrada) {
    throw new Error('sample entry de vídeo menor que o esperado');
  }
  const camposFixos = bytes.slice(inicioFixo, fimFixo);
  const configs = listarCaixas(bytes, fimFixo, offsetEntrada + tamanhoEntrada)
    .filter((c) => !CONFIG_AMOSTRA_VIDEO_DESCARTAR.has(c.tipo))
    .map((c) => bytes.slice(c.offset, c.offset + c.tamanho));
  return construirCaixa(formato, [camposFixos, ...configs]);
}

/** Reconstrói um container conhecido (moov/trak/mdia/minf/stbl/edts), descartando filhos indesejados. */
function reconstruirContainer(bytes: Uint8Array, caixa: CaixaMp4): Uint8Array {
  const filhos = listarCaixas(bytes, caixa.offset + caixa.tamanhoCabecalho, caixa.offset + caixa.tamanho).filter(
    (f) => !CAIXAS_QUICKTIME_DESCARTAR.has(f.tipo),
  );
  const partes = filhos.map((f) => reconstruirCaixa(bytes, f));
  return construirCaixa(caixa.tipo, partes);
}

function reconstruirCaixa(bytes: Uint8Array, caixa: CaixaMp4): Uint8Array {
  if (caixa.tipo === 'stsd') return reconstruirStsd(bytes, caixa);
  if (CONTAINERES_RECURSIVOS.has(caixa.tipo)) return reconstruirContainer(bytes, caixa);
  return bytes.slice(caixa.offset, caixa.offset + caixa.tamanho);
}

/** `stco`: version(1)+flags(3) + entry_count(4) + offsets de 32 bits. */
function somarDeltaStco(dv: DataView, c: CaixaMp4, delta: number): void {
  const offsetContagem = c.offset + c.tamanhoCabecalho + 4;
  const contagem = dv.getUint32(offsetContagem);
  let p = offsetContagem + 4;
  for (let i = 0; i < contagem; i++) {
    dv.setUint32(p, dv.getUint32(p) + delta);
    p += 4;
  }
}

/** `co64`: version(1)+flags(3) + entry_count(4) + offsets de 64 bits. */
function somarDeltaCo64(dv: DataView, c: CaixaMp4, delta: number): void {
  const offsetContagem = c.offset + c.tamanhoCabecalho + 4;
  const contagem = dv.getUint32(offsetContagem);
  let p = offsetContagem + 4;
  for (let i = 0; i < contagem; i++) {
    const alto = dv.getUint32(p);
    const baixo = dv.getUint32(p + 4);
    const valor = alto * 2 ** 32 + baixo + delta;
    dv.setUint32(p, Math.floor(valor / 2 ** 32));
    dv.setUint32(p + 4, valor >>> 0);
    p += 8;
  }
}

/** Corrige, em uma caixa moov já reconstruída e autocontida, todo stco/co64 pelo delta de posição do mdat. */
function corrigirOffsetsNaMoov(moov: Uint8Array, delta: number): void {
  if (delta === 0) return;
  const achadas = encontrarCaixasPorTipo(moov, TIPOS_OFFSET, 0, moov.length);
  const dv = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  for (const c of achadas) {
    if (c.tipo === 'stco') somarDeltaStco(dv, c, delta);
    else somarDeltaCo64(dv, c, delta);
  }
}

export function remuxarQuickTimeParaIsom(bytes: Uint8Array): ResultadoRemux {
  const topo = listarCaixas(bytes);

  const somaTopo = topo.reduce((n, c) => n + c.tamanho, 0);
  if (somaTopo !== bytes.length) {
    return falha('a estrutura de caixas de nível superior não cobre o arquivo inteiro');
  }

  const ftyp = topo.find((c) => c.tipo === 'ftyp');
  if (!ftyp) return falha('arquivo sem caixa ftyp');

  const major = textoAscii(bytes, ftyp.offset + 8, 4).trim().toLowerCase();
  if (major !== 'qt') return falha('o contêiner não é QuickTime (major brand ≠ "qt")');

  const moov = topo.find((c) => c.tipo === 'moov');
  if (!moov) return falha('arquivo sem caixa moov');

  const novoFtyp = construirFtypIsom();
  let moovReconstruido: Uint8Array;
  try {
    moovReconstruido = reconstruirContainer(bytes, moov);
  } catch (e) {
    return falha(`não foi possível reconstruir a caixa moov: ${(e as Error).message}`);
  }

  const pedacos: Uint8Array[] = [];
  let offsetNovoAcumulado = 0;
  let offsetNovoMdat = -1;
  let offsetAntigoMdat = -1;
  let indiceMoov = -1;

  for (const c of topo) {
    let bloco: Uint8Array;
    if (c.tipo === 'ftyp') {
      bloco = novoFtyp;
    } else if (c.tipo === 'moov') {
      bloco = moovReconstruido;
      indiceMoov = pedacos.length;
    } else {
      bloco = bytes.slice(c.offset, c.offset + c.tamanho);
    }

    if (c.tipo === 'mdat') {
      offsetNovoMdat = offsetNovoAcumulado;
      offsetAntigoMdat = c.offset;
    }
    pedacos.push(bloco);
    offsetNovoAcumulado += bloco.length;
  }

  if (offsetAntigoMdat < 0) return falha('arquivo sem caixa mdat');

  const delta = offsetNovoMdat - offsetAntigoMdat;
  if (indiceMoov >= 0) {
    corrigirOffsetsNaMoov(pedacos[indiceMoov]!, delta);
  }

  return { ok: true, bytes: concatUint8(pedacos), motivo: null };
}
