/**
 * Gera TODAS as fixtures sintéticas do projeto (spec §1.5).
 *
 * Regras invioláveis:
 * - Nenhum dado pessoal. Todo texto é fictício e declarado como tal.
 * - Nenhum download de terceiro. Tudo é construído byte a byte aqui.
 * - Certificado de assinatura: sempre autoassinado, gerado neste script.
 * - A saída vai para `fixtures/` (gitignored). O gerador é a fonte de verdade.
 *
 * Uso: `npm run fixtures`  (ou importar `gerarTodas()` de testes)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';
import {
  PdfBuilder,
  paginaBasica,
  fonteEmbutida,
  fonteNaoEmbutida,
  metadataXmp,
  recheio,
  XMP_PDFA,
  OUTPUT_INTENT_PDFA,
} from './lib/pdf-cru';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const DIR_FIXTURES = join(AQUI, '..', 'fixtures');

const TAMANHO_MAX_BYTES = 10 * 1024 * 1024; // espelha src/config/limites.ts (fixtures de fronteira)

// ───────────────────────────────────────────────────────────── util de tamanho

/** Ajusta o objeto de recheio até o PDF ter exatamente `alvo` bytes. */
function montarComTamanhoAlvo(
  construir: (recheioBytes: number) => Uint8Array,
  alvo: number,
): Uint8Array {
  let recheioBytes = Math.max(0, alvo - 400);
  let saida = construir(recheioBytes);
  for (let i = 0; i < 8 && saida.length !== alvo; i++) {
    recheioBytes += alvo - saida.length;
    if (recheioBytes < 0) recheioBytes = 0;
    saida = construir(recheioBytes);
  }
  if (saida.length !== alvo) {
    throw new Error(`não convergiu para ${alvo} bytes (chegou a ${saida.length})`);
  }
  return saida;
}

// ─────────────────────────────────────────────────────────── assinatura PKCS#7

interface CertAutoassinado {
  chave: forge.pki.rsa.PrivateKey;
  cert: forge.pki.Certificate;
}

function gerarCertAutoassinado(): CertAutoassinado {
  const par = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = par.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2020-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2035-01-01T00:00:00Z');
  const atributos = [
    { name: 'commonName', value: 'Fixture Autoassinada - Teste Sintetico' },
    { name: 'organizationName', value: 'Validador PJe (fixtures)' },
    { name: 'countryName', value: 'BR' },
  ];
  cert.setSubject(atributos);
  cert.setIssuer(atributos);
  cert.sign(par.privateKey, forge.md.sha256.create());
  return { chave: par.privateKey, cert };
}

/** DER de um CMS SignedData detached, em hex maiúsculo, para pôr em /Contents. */
function assinaturaCmsHex(id: CertAutoassinado): string {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer('conteudo ficticio assinado para fixture', 'utf8');
  p7.addCertificate(id.cert);
  p7.addSigner({
    key: id.chave,
    certificate: id.cert,
    digestAlgorithm: forge.pki.oids.sha256!,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType!, value: forge.pki.oids.data! },
      { type: forge.pki.oids.messageDigest! },
      { type: forge.pki.oids.signingTime!, value: new Date('2024-01-01T12:00:00Z').toString() },
    ],
  });
  p7.sign({ detached: true });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.bytesToHex(der).toUpperCase();
}

// ───────────────────────────────────────────────────────────────── PDFs

function pdfSimples(texto = 'Documento ficticio simples. Sem assinatura. Sem PDF/A.'): Uint8Array {
  const b = new PdfBuilder();
  const { catalogo } = paginaBasica(b, { texto });
  b.add({ dict: '<< /Length 60 >>', stream: Buffer.alloc(60, 0x20) }); // corpo modesto
  return b.build({ root: catalogo });
}

function pdfAssinado(id: CertAutoassinado, comDocMDP = false): Uint8Array {
  const b = new PdfBuilder();
  const sigContents = assinaturaCmsHex(id);
  const sig = b.reservar();
  const campo = b.reservar();
  const acroform = b.reservar();

  const permsRef = comDocMDP ? b.reservar() : null;
  const catalogoExtra =
    `/AcroForm ${acroform} 0 R` + (permsRef !== null ? ` /Perms ${permsRef} 0 R` : '');
  const { catalogo } = paginaBasica(b, {
    texto: 'Documento ficticio COM assinatura digital embarcada (fixture).',
    catalogoExtra,
    paginaExtra: `/Annots [${campo} 0 R]`,
  });

  b.colocar(
    sig,
    `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached ` +
      `/ByteRange [0 840 ${840 + sigContents.length + 2} 240] ` +
      `/Contents <${sigContents}> ` +
      `/M (D:20240101120000Z) /Name (Fixture Autoassinada) >>`,
  );
  b.colocar(
    campo,
    `<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature1) /V ${sig} 0 R ` +
      `/Rect [72 700 300 740] /P 3 0 R >>`,
  );
  b.colocar(acroform, `<< /Fields [${campo} 0 R] /SigFlags 3 >>`);
  if (permsRef !== null) {
    b.colocar(
      permsRef,
      `<< /DocMDP << /Type /TransformParams /P 2 /V /1.2 >> >>`,
    );
  }
  return b.build({ root: catalogo });
}

function pdfCampoSigVazio(): Uint8Array {
  const b = new PdfBuilder();
  const campo = b.reservar();
  const acroform = b.reservar();
  const { catalogo } = paginaBasica(b, {
    texto: 'Documento ficticio com campo de assinatura vazio (preparado, nao assinado).',
    catalogoExtra: `/AcroForm ${acroform} 0 R`,
    paginaExtra: `/Annots [${campo} 0 R]`,
  });
  b.colocar(
    campo,
    `<< /Type /Annot /Subtype /Widget /FT /Sig /T (Assinatura1) /Rect [72 700 300 740] /P 3 0 R >>`,
  );
  b.colocar(acroform, `<< /Fields [${campo} 0 R] /SigFlags 1 >>`);
  return b.build({ root: catalogo });
}

function pdfPdfa(parte: number, conformidade: string, opts: { comOutputIntent?: boolean; comTransparencia?: boolean } = {}): Uint8Array {
  const b = new PdfBuilder();
  const meta = metadataXmp(b, XMP_PDFA(parte, conformidade));
  const fontRef = fonteEmbutida(b);
  const partes: string[] = [`/Metadata ${meta} 0 R`];
  if (opts.comOutputIntent !== false) partes.push(OUTPUT_INTENT_PDFA);
  const { catalogo } = paginaBasica(b, {
    texto: `Documento ficticio declarado PDF/A-${parte}${conformidade}.`,
    fontRef,
    catalogoExtra: partes.join(' '),
    ...(opts.comTransparencia
      ? { paginaExtra: `/Group << /Type /Group /S /Transparency /CS /DeviceRGB >>` }
      : {}),
  });
  return b.build({ root: catalogo });
}

function pdfFonteNaoEmbutida(): Uint8Array {
  const b = new PdfBuilder();
  const fontRef = fonteNaoEmbutida(b);
  const { catalogo } = paginaBasica(b, {
    texto: 'Documento ficticio com fonte NAO embutida.',
    fontRef,
  });
  return b.build({ root: catalogo });
}

function pdfCriptografado(): Uint8Array {
  const b = new PdfBuilder();
  const enc = b.reservar();
  const { catalogo } = paginaBasica(b, { texto: 'Documento ficticio protegido por senha.' });
  b.colocar(
    enc,
    `<< /Filter /Standard /V 2 /R 3 /Length 128 /P -3904 ` +
      `/O <${'41'.repeat(32)}> /U <${'42'.repeat(32)}> >>`,
  );
  return b.build({
    root: catalogo,
    trailerExtra:
      `/Encrypt ${enc} 0 R /ID [ <31323334353637383930313233343536> <31323334353637383930313233343536> ]`,
  });
}

function pdfCorrompido(): Uint8Array {
  // Cabeçalho de PDF, mas o resto é ruído: nenhum objeto, nenhum xref, nenhum
  // trailer. O pdf-lib não consegue reconstruir nada disto.
  const cab = Buffer.from('%PDF-1.7\n', 'latin1');
  const ruido = Buffer.alloc(600);
  for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 37 + 11) % 256;
  return Buffer.concat([cab, ruido]);
}

function arquivoFalso(): Uint8Array {
  // Cabeçalho de executável PE ("MZ"), com nome .pdf.
  const buf = Buffer.alloc(512, 0x00);
  buf.write('MZ', 0, 'latin1');
  buf.write('This program cannot be run in DOS mode.', 78, 'latin1');
  buf.write('PE  ', 128, 'latin1');
  return buf;
}

function pdfComTamanho(alvo: number, texto: string): Uint8Array {
  return montarComTamanhoAlvo((recheioBytes) => {
    const b = new PdfBuilder();
    const { catalogo } = paginaBasica(b, { texto });
    recheio(b, recheioBytes);
    return b.build({ root: catalogo });
  }, alvo);
}

// ───────────────────────────────────────────────────────────────── mídia

function mp3(frames: number): Uint8Array {
  const id3 = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const frame = Buffer.alloc(417, 0x00);
  frame[0] = 0xff;
  frame[1] = 0xfb; // MPEG-1 Layer III, sem CRC
  frame[2] = 0x90; // bitrate 128k, samplerate 44100
  frame[3] = 0x64;
  const partes: Buffer[] = [id3];
  for (let i = 0; i < frames; i++) partes.push(frame);
  return Buffer.concat(partes);
}

function caixaMp4(tipo: string, payload: Buffer): Buffer {
  const cab = Buffer.alloc(8);
  cab.writeUInt32BE(payload.length + 8, 0);
  cab.write(tipo, 4, 'latin1');
  return Buffer.concat([cab, payload]);
}

function mp4(payloadMdat: Buffer): Uint8Array {
  const ftyp = caixaMp4(
    'ftyp',
    Buffer.concat([
      Buffer.from('isom', 'latin1'),
      Buffer.from([0x00, 0x00, 0x00, 0x00]),
      Buffer.from('isommp41', 'latin1'),
    ]),
  );
  const moov = caixaMp4('moov', caixaMp4('mvhd', Buffer.alloc(96, 0x00)));
  const mdat = caixaMp4('mdat', payloadMdat);
  return Buffer.concat([ftyp, moov, mdat]);
}

// ─────────────────────────────────────────────────────────────── orquestração

async function assertCarregaNoPdfLib(nome: string, bytes: Uint8Array): Promise<void> {
  try {
    await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    throw new Error(`fixture ${nome} deveria carregar no pdf-lib mas falhou: ${(e as Error).message}`);
  }
}

export async function gerarTodas(): Promise<Record<string, Uint8Array>> {
  const id = gerarCertAutoassinado();

  const mapa: Record<string, Uint8Array> = {
    'simples.pdf': pdfSimples(),
    'simples-sem-pdfa.pdf': pdfSimples('Documento ficticio comum, sem metadados PDF/A.'),
    'assinado.pdf': pdfAssinado(id),
    'assinado-e-sem-pdfa.pdf': pdfAssinado(id), // assinado + sem XMP/OutputIntent
    'campo-sig-vazio.pdf': pdfCampoSigVazio(),
    'docmdp.pdf': pdfAssinado(id, true),
    'pdfa-1b.pdf': pdfPdfa(1, 'B'),
    'pdfa-2b-transparencia.pdf': pdfPdfa(2, 'B', { comTransparencia: true }),
    'declara-a1b-sem-oi.pdf': pdfPdfa(1, 'B', { comOutputIntent: false }),
    'fonte-nao-embutida.pdf': pdfFonteNaoEmbutida(),
    'criptografado.pdf': pdfCriptografado(),
    'corrompido.pdf': pdfCorrompido(),
    'falso.pdf': arquivoFalso(),
    'limite-exato.pdf': pdfComTamanho(TAMANHO_MAX_BYTES, 'Fixture de fronteira: exatamente no limite.'),
    'acima-limite.pdf': pdfComTamanho(TAMANHO_MAX_BYTES + 1, 'Fixture de fronteira: um byte acima do limite.'),
    'imagens-pesadas.pdf': pdfComTamanho(25 * 1024 * 1024, 'Fixture pesada para testar compressao (Fase 2).'),
    'audio.mp3': mp3(60),
    'audio-grande.mp3': mp3(Math.ceil((TAMANHO_MAX_BYTES + 1) / 417)),
    'video.mp4': mp4(Buffer.alloc(2048, 0x00)),
    'video-grande.mp4': mp4(Buffer.alloc(TAMANHO_MAX_BYTES + 1, 0x00)),
  };

  // Normaliza para Uint8Array puro do realm atual: sob vitest, Buffer do Node
  // pode não passar no `instanceof Uint8Array` do pdf-lib.
  for (const k of Object.keys(mapa)) mapa[k] = new Uint8Array(mapa[k] as Uint8Array);

  // Sanidade: os PDFs "bons" precisam abrir no pdf-lib.
  const bons = [
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
    'limite-exato.pdf',
    'acima-limite.pdf',
    'imagens-pesadas.pdf',
  ];
  for (const nome of bons) await assertCarregaNoPdfLib(nome, mapa[nome]!);

  return mapa;
}

export async function escreverTodas(): Promise<void> {
  mkdirSync(DIR_FIXTURES, { recursive: true });
  const mapa = await gerarTodas();
  for (const [nome, bytes] of Object.entries(mapa)) {
    writeFileSync(join(DIR_FIXTURES, nome), bytes);
  }
  const total = Object.values(mapa).reduce((n, b) => n + b.length, 0);
  console.log(`${Object.keys(mapa).length} fixtures geradas em ${DIR_FIXTURES} (${(total / 1024 / 1024).toFixed(1)} MB)`);
}

const executadoDireto = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (executadoDireto) {
  escreverTodas().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
