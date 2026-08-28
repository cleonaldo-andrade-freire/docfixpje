# Decisão P2-0 — Licença do motor de correção

**Data:** 2026-08-28 · **Status:** decidida

## Contexto

A Fase 2 reescreve o PDF (remover assinatura + converter para PDF/A + comprimir)
numa única passada. O único motor que faz conversão PDF/A real é **Ghostscript**,
distribuído sob **AGPL-3.0**. MuPDF (Artifex) também é AGPL e, além disso, não
faz conversão PDF/A. Alternativas permissivas (qpdf, pdfcpu) fazem remoção de
assinatura e compressão, mas **não** geram conformidade PDF/A.

## Opções

| Opção | Motor | Faz PDF/A? | Obrigação de licença |
|---|---|---|---|
| **A** | Ghostscript-WASM | sim | Publicar a aplicação inteira sob AGPL-3.0 |
| B | MuPDF-WASM | não (trabalhoso) | AGPL-3.0 (mesma obrigação) |
| C | qpdf/pdfcpu WASM | **não** | Apache-2.0 / permissiva |

## Decisão: **Opção A — Ghostscript-WASM, aplicação sob AGPL-3.0**

A aplicação **já seria open source** por decisão da própria especificação
(§10.4 "código aberto e verificável", §13). Logo, a obrigação da AGPL de
disponibilizar o código-fonte da aplicação inteira **já está satisfeita por
escolha do projeto** — a AGPL não adiciona custo real, só formaliza o que já
seria feito. A opção C obrigaria a abrir mão da correção automática da Regra 3,
que é metade do valor da Fase 2.

## Consequências / ações

- `LICENSE` na raiz: **GNU AGPL-3.0** (texto completo, 659 linhas).
- `package.json` → `"license": "AGPL-3.0-or-later"`.
- Rodapé da interface: aviso de licença + link para o código-fonte + atribuição
  do Ghostscript (versão + link), quando o motor for embarcado.
- O binário `.wasm` é servido como asset estático versionado por hash pela
  própria origem (spec §8.3.7), com `Access-Control-Allow-Origin` restrito ao
  domínio oficial.
- Qualquer fork hospedado publicamente herda a AGPL: precisa publicar o fonte.

## Motor integrado

`@jspawn/ghostscript-wasm@0.0.2` **funciona no navegador** (não em Node — daí
os testes unitários usarem um motor dublê e a verificação real ser via
Playwright/Chromium em `tests/e2e/correcao-real.spec.ts`).

- `scripts/preparar-motor.ts` copia `gs.<hash>.wasm` + o glue Emscripten para
  `public/motores/` no `postinstall`/`prebuild`. O `.wasm` (~15 MB) é gerado,
  **não versionado** (`.gitignore`), reproduzível a partir do pacote pinado.
- `src/correcao/motorGs.ts` adapta o build à interface `MotorPdf`. Carregado
  sob demanda, dentro do worker, servido pela própria origem.
- `public/_headers`: `/motores/*.wasm` com `Cache-Control: immutable`,
  `Access-Control-Allow-Origin` restrito ao domínio oficial e `CORP: same-origin`.
- Extração de texto para a checagem de preservação: `fflate` infla os content
  streams `/FlateDecode` da saída do Ghostscript (sem pdfjs).

E2E comprovado: `assinado.pdf` → "Tentar corrigir" → **"Corrigido — revalidado
com sucesso"** em ~3 s, texto preservado, zero requisições a terceiros.

Se o build atual se mostrar limitado em produção (parte-alfa), trocar por um
Ghostscript compilado de fonte via emsdk toca só `motorGs.ts` (spec §15).
