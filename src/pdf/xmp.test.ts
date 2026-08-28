import { extrairXmp, lerPdfaId } from './xmp';

const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

const XMP_A1B = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
    pdfaid:part="1" pdfaid:conformance="B"/>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

test('extrai o packet entre xpacket begin e end', () => {
  const dentro = ascii(`...lixo...${XMP_A1B}...lixo...`);
  const pkt = extrairXmp(dentro);
  expect(pkt).toContain('pdfaid:part');
  expect(pkt).toContain('<?xpacket end');
});

test('sem packet -> null', () => {
  expect(extrairXmp(ascii('um pdf qualquer sem xmp'))).toBeNull();
});

test('lê parte e conformância como atributo', () => {
  expect(lerPdfaId(XMP_A1B)).toEqual({ parte: 1, conformidade: 'B' });
});

test('lê parte e conformância como elemento e prefixo alternativo', () => {
  const xmp = `<rdf:Description xmlns:aid="http://www.aiim.org/pdfa/ns/id/">
    <aid:part>2</aid:part><aid:conformance>U</aid:conformance></rdf:Description>`;
  expect(lerPdfaId(xmp)).toEqual({ parte: 2, conformidade: 'U' });
});

test('XMP sem pdfaid -> null', () => {
  expect(lerPdfaId('<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"/>')).toBeNull();
});

test('parte fora de 1..4 -> null', () => {
  const xmp = XMP_A1B.replace('pdfaid:part="1"', 'pdfaid:part="7"');
  expect(lerPdfaId(xmp)).toBeNull();
});
