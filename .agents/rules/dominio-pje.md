# Glossário do domínio PJe

- **PJe** — Processo Judicial eletrônico, sistema de tramitação processual do
  Judiciário brasileiro. Aqui, o sistema onde o usuário anexa arquivos.
- **Peticionamento** — ato de protocolar/anexar petições e documentos no PJe.
- **PAdES** — PDF Advanced Electronic Signatures. Assinatura digital embarcada
  no próprio PDF (dicionário de assinatura com `/ByteRange` e `/Contents`).
- **CAdES** — assinatura digital em contêiner CMS separado (`.p7s`). Fora do
  escopo direto, citado por contraste.
- **ICP-Brasil** — infraestrutura de chaves públicas brasileira; emite os
  certificados usados nas assinaturas oficiais. Nunca usar certificado real em
  fixture — sempre autoassinado gerado pelo script.
- **PDF/A** — perfil ISO 19005 de PDF para arquivamento de longo prazo. Tem
  *declaração* (metadados XMP `pdfaid`) e *conformidade real* (fontes
  embutidas, OutputIntent, sem JavaScript, etc). Nunca afirmar ao usuário que
  um arquivo "é PDF/A válido" — no máximo que está declarado e passou nas
  verificações básicas.
- **DocMDP / UR3** — permissões de modificação (`/Perms`) que acompanham
  assinaturas de certificação. Presença indica assinatura.
