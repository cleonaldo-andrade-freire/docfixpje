/**
 * Parser/serializador mínimo de ISO BMFF (MP4) e QuickTime (MOV).
 *
 * Só o necessário para remuxar um MOV em MP4: uma árvore de boxes onde cada nó
 * é `prefixo` (bytes fixos logo após o header) + `filhos` (ou null, se folha).
 * Esse formato único cobre containers puros (`moov`, prefixo vazio), boxes com
 * cabeçalho fixo antes dos filhos (`stsd`, `dref`) e as sample entries
 * (`avc1`, `mp4a`), que são o cerne da incompatibilidade QuickTime→MP4.
 *
 * O `mdat` NUNCA entra na árvore: ele é copiado por referência pelo remuxador
 * (spec §9 — nada de duplicar centenas de MB em memória sem necessidade).
 */

export interface NoBox {
  tipo: string;
  /** Bytes fixos entre o header do box e os filhos. Para folhas, é o payload inteiro. */
  prefixo: Uint8Array;
  /** null = folha. */
  filhos: NoBox[] | null;
}

/** Boxes cujo payload é só uma lista de filhos. */
const CONTAINERS = new Set([
  'moov',
  'trak',
  'edts',
  'mdia',
  'minf',
  'dinf',
  'stbl',
  'udta',
  'mvex',
  'moof',
  'traf',
  'mfra',
  'tref',
  'gmhd',
  'wave',
  'sinf',
  'schi',
  'tapt',
]);

/** Boxes com cabeçalho fixo (bytes após o header do box) antes da lista de filhos. */
const PREFIXO_FIXO: Readonly<Record<string, number>> = {
  stsd: 8, // version/flags + entry_count
  dref: 8, // version/flags + entry_count
};

/** VisualSampleEntry: 78 bytes após o header do box, depois sub-boxes. */
export const VISUAL_SAMPLE_ENTRY_PREFIXO = 78;

/** AudioSampleEntry v0: 28 bytes após o header do box. v1 soma 16; v2 soma 36. */
export const AUDIO_SAMPLE_ENTRY_PREFIXO = 28;

export const CODECS_VIDEO = new Set(['avc1', 'avc3', 'hvc1', 'hev1', 'av01', 'mp4v', 'vp09']);
export const CODECS_AUDIO = new Set(['mp4a', 'ac-3', 'ec-3', 'Opus', 'alac', 'fLaC']);

export function tipoDoBox(bytes: Uint8Array, offset: number): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += String.fromCharCode(bytes[offset + 4 + i] ?? 0);
  return s;
}

export function u32(bytes: Uint8Array, o: number): number {
  return (
    (((bytes[o] ?? 0) << 24) | ((bytes[o + 1] ?? 0) << 16) | ((bytes[o + 2] ?? 0) << 8) | (bytes[o + 3] ?? 0)) >>> 0
  );
}

export function u16(bytes: Uint8Array, o: number): number {
  return (((bytes[o] ?? 0) << 8) | (bytes[o + 1] ?? 0)) >>> 0;
}

export function escreverU32(destino: Uint8Array, o: number, v: number): void {
  destino[o] = (v >>> 24) & 0xff;
  destino[o + 1] = (v >>> 16) & 0xff;
  destino[o + 2] = (v >>> 8) & 0xff;
  destino[o + 3] = v & 0xff;
}

export interface BoxBruto {
  tipo: string;
  /** Offset do primeiro byte do header. */
  inicio: number;
  /** Offset logo após o último byte do box. */
  fim: number;
  /** Offset do primeiro byte do payload (8 ou 16, conforme largesize). */
  corpoInicio: number;
}

/**
 * Percorre os boxes de um intervalo, sem recursão e sem copiar bytes.
 * Retorna [] se encontrar um tamanho inconsistente (arquivo truncado).
 */
export function listarBoxes(bytes: Uint8Array, inicio: number, fim: number): BoxBruto[] {
  const out: BoxBruto[] = [];
  let o = inicio;
  while (o + 8 <= fim) {
    let tamanho = u32(bytes, o);
    let corpo = o + 8;
    if (tamanho === 1) {
      // largesize de 64 bits; acima de 2^53 não representável — desiste.
      const alto = u32(bytes, o + 8);
      const baixo = u32(bytes, o + 12);
      if (alto > 0x1fffff) return out;
      tamanho = alto * 0x1_0000_0000 + baixo;
      corpo = o + 16;
    } else if (tamanho === 0) {
      tamanho = fim - o;
    }
    if (tamanho < corpo - o || o + tamanho > fim) return out;
    out.push({ tipo: tipoDoBox(bytes, o), inicio: o, fim: o + tamanho, corpoInicio: corpo });
    o += tamanho;
  }
  return out;
}

/** Parseia um intervalo em nós, recursivamente. `dentroDeStsd` troca a regra de prefixo. */
export function parsearBoxes(
  bytes: Uint8Array,
  inicio: number,
  fim: number,
  dentroDeStsd = false,
): NoBox[] {
  return listarBoxes(bytes, inicio, fim).map((b) => parsearNo(bytes, b, dentroDeStsd));
}

function parsearNo(bytes: Uint8Array, b: BoxBruto, dentroDeStsd: boolean): NoBox {
  const folha = (): NoBox => ({
    tipo: b.tipo,
    prefixo: bytes.subarray(b.corpoInicio, b.fim),
    filhos: null,
  });

  if (dentroDeStsd) {
    const tamPrefixo = prefixoDeSampleEntry(bytes, b);
    if (tamPrefixo === null) return folha();
    const inicioFilhos = b.corpoInicio + tamPrefixo;
    if (inicioFilhos > b.fim) return folha();
    return {
      tipo: b.tipo,
      prefixo: bytes.subarray(b.corpoInicio, inicioFilhos),
      filhos: parsearBoxes(bytes, inicioFilhos, b.fim),
    };
  }

  if (CONTAINERS.has(b.tipo)) {
    return { tipo: b.tipo, prefixo: new Uint8Array(0), filhos: parsearBoxes(bytes, b.corpoInicio, b.fim) };
  }

  const fixo = PREFIXO_FIXO[b.tipo];
  if (fixo !== undefined && b.corpoInicio + fixo <= b.fim) {
    const inicioFilhos = b.corpoInicio + fixo;
    return {
      tipo: b.tipo,
      prefixo: bytes.subarray(b.corpoInicio, inicioFilhos),
      filhos: parsearBoxes(bytes, inicioFilhos, b.fim, b.tipo === 'stsd'),
    };
  }

  return folha();
}

/**
 * Tamanho do cabeçalho fixo de uma sample entry, ou null se o codec é
 * desconhecido (aí o nó vira folha e é copiado byte a byte).
 * AudioSampleEntry v1 traz 16 bytes extras e v2 traz 36 — só o QuickTime usa.
 */
function prefixoDeSampleEntry(bytes: Uint8Array, b: BoxBruto): number | null {
  if (CODECS_VIDEO.has(b.tipo)) return VISUAL_SAMPLE_ENTRY_PREFIXO;
  if (CODECS_AUDIO.has(b.tipo)) {
    const versao = u16(bytes, b.corpoInicio + 8);
    const extra = versao === 1 ? 16 : versao === 2 ? 36 : 0;
    return AUDIO_SAMPLE_ENTRY_PREFIXO + extra;
  }
  return null;
}

/** Tamanho total em bytes que o nó ocupará ao ser serializado (header incluso). */
export function tamanhoSerializado(no: NoBox): number {
  const filhos = no.filhos?.reduce((n, f) => n + tamanhoSerializado(f), 0) ?? 0;
  return 8 + no.prefixo.length + filhos;
}

/** Serializa o nó (header de 32 bits — nenhum box da árvore chega a 4 GB). */
export function serializar(no: NoBox): Uint8Array {
  const total = tamanhoSerializado(no);
  const out = new Uint8Array(total);
  escreverNo(no, out, 0);
  return out;
}

function escreverNo(no: NoBox, destino: Uint8Array, offset: number): number {
  const total = tamanhoSerializado(no);
  escreverU32(destino, offset, total);
  for (let i = 0; i < 4; i++) destino[offset + 4 + i] = no.tipo.charCodeAt(i) & 0xff;
  destino.set(no.prefixo, offset + 8);
  let o = offset + 8 + no.prefixo.length;
  for (const f of no.filhos ?? []) o = escreverNo(f, destino, o);
  return o;
}

/** Primeiro descendente direto com o tipo dado. */
export function acharFilho(no: NoBox, tipo: string): NoBox | undefined {
  return no.filhos?.find((f) => f.tipo === tipo);
}

/** Todos os descendentes (em qualquer profundidade) com o tipo dado. */
export function acharDescendentes(no: NoBox, tipo: string, out: NoBox[] = []): NoBox[] {
  for (const f of no.filhos ?? []) {
    if (f.tipo === tipo) out.push(f);
    acharDescendentes(f, tipo, out);
  }
  return out;
}
