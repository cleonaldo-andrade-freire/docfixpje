import { listarCaixas, encontrarCaixasPorTipo, type CaixaMp4 } from '../deteccao/caixasMp4';

/**
 * Remux de contêiner QuickTime (`ftyp` brand "qt") para MP4/ISO padrão, sem
 * recodificar vídeo/áudio (§16.6). O PJe recusa vídeos de iPhone/WhatsApp
 * cuja extensão é .mp4 mas o contêiner interno é QuickTime — o codec
 * (avc1/mp4a) já é compatível, só o `ftyp` e os offsets absolutos em
 * `stco`/`co64` (que mudam de tamanho por causa do novo `ftyp`) precisam
 * ser reescritos. `mdat` (as amostras de vídeo/áudio) é copiado byte a byte.
 */

export interface ResultadoRemux {
  ok: boolean;
  bytes: Uint8Array | null;
  motivo: string | null;
}

/** Mesmas brands dos arquivos "-convertido" já aceitos pelo PJe (§16.6). */
const BRANDS_COMPATIVEIS = ['isom', 'iso2', 'avc1', 'mp41'];

const TIPOS_OFFSET = new Set(['stco', 'co64']);

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

function construirFtypIsom(): Uint8Array {
  const tamanho = 8 + 4 + 4 + BRANDS_COMPATIVEIS.length * 4;
  const out = new Uint8Array(tamanho);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, tamanho);
  out.set(paraAscii('ftyp'), 4);
  out.set(paraAscii('isom'), 8);
  dv.setUint32(12, 512);
  let o = 16;
  for (const brand of BRANDS_COMPATIVEIS) {
    out.set(paraAscii(brand), o);
    o += 4;
  }
  return out;
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

function corrigirOffsetsNaMoov(saida: Uint8Array, inicio: number, fim: number, delta: number): void {
  const achadas = encontrarCaixasPorTipo(saida, TIPOS_OFFSET, inicio, fim);
  const dv = new DataView(saida.buffer, saida.byteOffset, saida.byteLength);
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
  const delta = novoFtyp.length - ftyp.tamanho;

  const saida = new Uint8Array(bytes.length + delta);
  let destino = 0;
  for (const c of topo) {
    if (c.tipo === 'ftyp') {
      saida.set(novoFtyp, destino);
      destino += novoFtyp.length;
      continue;
    }
    saida.set(bytes.subarray(c.offset, c.offset + c.tamanho), destino);
    if (c.tipo === 'moov') {
      corrigirOffsetsNaMoov(saida, destino, destino + c.tamanho, delta);
    }
    destino += c.tamanho;
  }

  return { ok: true, bytes: saida, motivo: null };
}
