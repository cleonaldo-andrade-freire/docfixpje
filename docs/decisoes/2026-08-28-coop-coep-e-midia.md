# Decisão P2-1 — COOP/COEP e correção de mídia

**Data:** 2026-08-28 · **Status:** decidida

## COOP/COEP

`ffmpeg.wasm` multi-thread exige `SharedArrayBuffer`, que exige
`Cross-Origin-Opener-Policy: same-origin` **e**
`Cross-Origin-Embedder-Policy: require-corp`. `COEP: require-corp` obriga todo
subrecurso a mandar `Cross-Origin-Resource-Policy` ou `crossorigin`, e pode
quebrar partes da página.

Ghostscript-WASM **não** exige `SharedArrayBuffer`.

### Decisão: **não ativar COEP.**

`public/_headers` mantém `Cross-Origin-Opener-Policy: same-origin` e
`Cross-Origin-Resource-Policy: same-origin` (já presentes desde a Fase 1), mas
**não** `require-corp`. O motor de PDF (Ghostscript) roda sem SAB.

## Correção de mídia (MP3/MP4 acima do limite)

`ffmpeg.wasm` single-thread passa de 30 MB e recodifica um vídeo de poucos
minutos em vários minutos no navegador — a correção mais cara do projeto (§8.2).

### Decisão: **Fase 2 NÃO recodifica mídia. Só orientação textual.**

A spec §8.2 permite explicitamente ("Considerar aceitável entregar a Fase 2 sem
correção de mídia, deixando apenas orientação textual para MP3/MP4").

- MP3/MP4 com `TAMANHO_EXCEDIDO` → estado `nao_corrigivel`, com orientação:
  reduzir a duração ou recodificar com bitrate menor num editor.
- Sem dependência de `@ffmpeg/*` no projeto. Sem `ConfirmacaoMidia`.
- Se no futuro a recodificação entrar, ela segue o mesmo contrato de motor
  injetável e nenhum cabeçalho novo é necessário (single-thread).

## Consequências

- `_headers` inalterado quanto a COEP.
- `src/config/limites.ts` não ganha `MARGEM_BITRATE` nem tentativas de mídia.
- `corrigirArquivo` roteia MP3/MP4 (`TAMANHO_EXCEDIDO`) direto para `nao_corrigivel`.

## Adendo (2026-09-09) — remux de contêiner não é recodificação

Esta decisão trata de **recodificar** mídia (mudar bitrate/pixels via
`ffmpeg.wasm`) para caber no limite de tamanho. Não se aplica ao caso de MP4
com contêiner QuickTime (`ftyp` brand `qt`, comum em vídeo de iPhone/WhatsApp,
§16.6.1 da spec): ali só o `ftyp` e os offsets de `stco`/`co64` são
reescritos, o `mdat` (vídeo/áudio) é copiado byte a byte. É JS puro, sem
`ffmpeg.wasm`, sem `SharedArrayBuffer`, sem worker — implementado em
`src/correcao/remuxMp4.ts`.
