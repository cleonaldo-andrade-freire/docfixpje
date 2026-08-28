/**
 * Montador de PDF cru, byte a byte, para gerar fixtures sintéticas com controle
 * total sobre trailer, /Encrypt, /AcroForm, dicionários de assinatura,
 * /OutputIntents e XMP — coisas que o pdf-lib não expõe para escrita.
 *
 * Todas as strings são tratadas como latin1 (1 byte por code unit), igual à
 * varredura dos validadores, para que os offsets do xref fiquem exatos.
 */

const bin = (s: string): Buffer => Buffer.from(s, 'latin1');

export type CorpoObjeto = string | { dict: string; stream: Buffer | string };

export class PdfBuilder {
  private objetos: (CorpoObjeto | null)[] = [];

  /** Reserva um número de objeto sem definir o conteúdo ainda (refs circulares). */
  reservar(): number {
    this.objetos.push(null);
    return this.objetos.length;
  }

  /** Define o conteúdo de um objeto reservado. */
  colocar(n: number, corpo: CorpoObjeto): void {
    this.objetos[n - 1] = corpo;
  }

  /** Reserva e define de uma vez. Devolve o número do objeto. */
  add(corpo: CorpoObjeto): number {
    const n = this.reservar();
    this.colocar(n, corpo);
    return n;
  }

  private serializarObjeto(corpo: CorpoObjeto): Buffer {
    if (typeof corpo === 'string') return bin(corpo);
    const streamBuf = typeof corpo.stream === 'string' ? bin(corpo.stream) : corpo.stream;
    return Buffer.concat([bin(corpo.dict + '\nstream\n'), streamBuf, bin('\nendstream')]);
  }

  build(opts: { root: number; trailerExtra?: string }): Uint8Array {
    for (let i = 0; i < this.objetos.length; i++) {
      if (this.objetos[i] === null) {
        throw new Error(`objeto ${i + 1} reservado mas não definido`);
      }
    }

    const chunks: Buffer[] = [];
    let tamanho = 0;
    const push = (b: Buffer) => {
      chunks.push(b);
      tamanho += b.length;
    };

    push(bin('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n'));

    const offsets: number[] = [];
    this.objetos.forEach((corpo, idx) => {
      offsets[idx] = tamanho;
      push(bin(`${idx + 1} 0 obj\n`));
      push(this.serializarObjeto(corpo as CorpoObjeto));
      push(bin('\nendobj\n'));
    });

    const inicioXref = tamanho;
    const total = this.objetos.length + 1;
    let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (const off of offsets) {
      xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    push(bin(xref));

    const extra = opts.trailerExtra ? ' ' + opts.trailerExtra : '';
    push(bin(`trailer\n<< /Size ${total} /Root ${opts.root} 0 R${extra} >>\nstartxref\n${inicioXref}\n%%EOF`));

    return Buffer.concat(chunks);
  }
}

/** Bloco de 4 objetos: catálogo, pages, uma página e o content stream. */
export function paginaBasica(
  b: PdfBuilder,
  opts: {
    catalogoExtra?: string;
    fontRef?: number;
    paginaExtra?: string;
    texto?: string;
  } = {},
): { catalogo: number } {
  const catalogo = b.reservar();
  const pages = b.reservar();
  const pagina = b.reservar();

  const texto = opts.texto ?? 'Documento ficticio para teste automatizado. Nao contem dado pessoal.';
  const conteudo = `BT /F1 12 Tf 72 720 Td (${texto}) Tj ET\n`;
  const conteudoRef = b.add({ dict: `<< /Length ${conteudo.length} >>`, stream: conteudo });

  const fontRef =
    opts.fontRef ?? b.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  b.colocar(
    pagina,
    `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${fontRef} 0 R >> >> /Contents ${conteudoRef} 0 R` +
      `${opts.paginaExtra ? ' ' + opts.paginaExtra : ''} >>`,
  );
  b.colocar(pages, `<< /Type /Pages /Kids [${pagina} 0 R] /Count 1 >>`);
  b.colocar(
    catalogo,
    `<< /Type /Catalog /Pages ${pages} 0 R${opts.catalogoExtra ? ' ' + opts.catalogoExtra : ''} >>`,
  );

  return { catalogo };
}

/** Objeto de fonte com FontDescriptor + FontFile2 (conta como fonte embutida). */
export function fonteEmbutida(b: PdfBuilder): number {
  const programa = Buffer.alloc(2048, 0x00); // não precisa ser um TTF real p/ a varredura
  const fontFile = b.add({
    dict: `<< /Length ${programa.length} /Length1 ${programa.length} >>`,
    stream: programa,
  });
  const descritor = b.add(
    `<< /Type /FontDescriptor /FontName /ABCDEE+LiberacaoTeste /Flags 32 ` +
      `/FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 900 /Descent -200 ` +
      `/CapHeight 700 /StemV 80 /FontFile2 ${fontFile} 0 R >>`,
  );
  return b.add(
    `<< /Type /Font /Subtype /TrueType /BaseFont /ABCDEE+LiberacaoTeste ` +
      `/FirstChar 32 /LastChar 255 /FontDescriptor ${descritor} 0 R >>`,
  );
}

/** Objeto de fonte com FontDescriptor SEM FontFile (fonte não embutida). */
export function fonteNaoEmbutida(b: PdfBuilder): number {
  const descritor = b.add(
    `<< /Type /FontDescriptor /FontName /Helvetica /Flags 32 ` +
      `/FontBBox [0 0 1000 1000] /ItalicAngle 0 /Ascent 900 /Descent -200 ` +
      `/CapHeight 700 /StemV 80 >>`,
  );
  return b.add(
    `<< /Type /Font /Subtype /TrueType /BaseFont /Helvetica ` +
      `/FirstChar 32 /LastChar 255 /FontDescriptor ${descritor} 0 R >>`,
  );
}

export const XMP_PDFA = (parte: number, conformidade: string): string =>
  `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
  `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
  ` <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +
  `  <rdf:Description rdf:about=""\n` +
  `    xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"\n` +
  `    pdfaid:part="${parte}" pdfaid:conformance="${conformidade}"/>\n` +
  ` </rdf:RDF>\n` +
  `</x:xmpmeta>\n` +
  `<?xpacket end="w"?>`;

export function metadataXmp(b: PdfBuilder, xmp: string): number {
  return b.add({
    dict: `<< /Type /Metadata /Subtype /XML /Length ${bin(xmp).length} >>`,
    stream: xmp,
  });
}

export const OUTPUT_INTENT_PDFA =
  `/OutputIntents [ << /Type /OutputIntent /S /GTS_PDFA1 ` +
  `/OutputConditionIdentifier (sRGB IEC61966-2.1) /Info (sRGB IEC61966-2.1) >> ]`;

/** Objeto stream inerte, usado só para inflar o arquivo até um tamanho alvo. */
export function recheio(b: PdfBuilder, bytes: number): number {
  const buf = Buffer.alloc(Math.max(0, bytes), 0x20);
  return b.add({ dict: `<< /Length ${buf.length} >>`, stream: buf });
}
