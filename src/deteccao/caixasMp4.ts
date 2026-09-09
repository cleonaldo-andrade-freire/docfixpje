/**
 * Leitura de caixas (boxes) ISO BMFF/QuickTime — nível único, sem recursão.
 * Usado pela detecção de codec e pelo remux de contêiner (§16.6, remux QuickTime→ISO).
 */

export interface CaixaMp4 {
  tipo: string;
  /** Offset absoluto do início da caixa (incluindo o cabeçalho). */
  offset: number;
  /** Tamanho total da caixa, incluindo o cabeçalho. */
  tamanho: number;
  /** 8 bytes (tamanho normal) ou 16 bytes (tamanho estendido de 64 bits). */
  tamanhoCabecalho: number;
}

function textoAscii(bytes: Uint8Array, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[offset + i] ?? 0);
  return s;
}

/** Lista as caixas de nível único no intervalo [inicio, fim). Para de listar ao achar uma caixa malformada. */
export function listarCaixas(bytes: Uint8Array, inicio = 0, fim: number = bytes.length): CaixaMp4[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const caixas: CaixaMp4[] = [];
  let offset = inicio;

  while (offset + 8 <= fim) {
    const tamanho32 = dv.getUint32(offset);
    const tipo = textoAscii(bytes, offset + 4, 4);
    let tamanho: number;
    let tamanhoCabecalho: number;

    if (tamanho32 === 1) {
      if (offset + 16 > fim) break;
      const alto = dv.getUint32(offset + 8);
      const baixo = dv.getUint32(offset + 12);
      tamanho = alto * 2 ** 32 + baixo;
      tamanhoCabecalho = 16;
    } else if (tamanho32 === 0) {
      tamanho = fim - offset;
      tamanhoCabecalho = 8;
    } else {
      tamanho = tamanho32;
      tamanhoCabecalho = 8;
    }

    if (tamanho < tamanhoCabecalho || offset + tamanho > fim) break;

    caixas.push({ tipo, offset, tamanho, tamanhoCabecalho });
    offset += tamanho;
  }

  return caixas;
}

/** Caixas que só existem como contêiner de outras caixas num mp4/mov não fragmentado. */
const CONTAINERES_MP4 = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);

/**
 * Busca em profundidade por caixas de um dos `tipos`, descendo apenas por
 * contêineres conhecidos (nunca entra em `mdat`, então payload de mídia não
 * é confundido com uma sub-caixa).
 */
export function encontrarCaixasPorTipo(
  bytes: Uint8Array,
  tipos: ReadonlySet<string>,
  inicio = 0,
  fim: number = bytes.length,
): CaixaMp4[] {
  const achadas: CaixaMp4[] = [];
  const pilha: Array<[number, number]> = [[inicio, fim]];
  while (pilha.length > 0) {
    const [i, f] = pilha.pop()!;
    for (const c of listarCaixas(bytes, i, f)) {
      if (tipos.has(c.tipo)) achadas.push(c);
      if (CONTAINERES_MP4.has(c.tipo)) pilha.push([c.offset + c.tamanhoCabecalho, c.offset + c.tamanho]);
    }
  }
  return achadas;
}
