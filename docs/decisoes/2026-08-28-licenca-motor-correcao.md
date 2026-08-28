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

## Pendência técnica (não altera a decisão de licença)

Nenhum build de Ghostscript-WASM pronto para uso foi encontrado:
`@jspawn/ghostscript-wasm@0.0.2` é pré-alfa e não instancia (nem no navegador de
forma confiável, nem em Node). Enquanto não houver um build funcional
(compilar de fonte via emsdk, ou um pacote maduro), a Fase 2 opera em
**degradação graciosa**: o motor reporta indisponível e a linha vai para
`correcao_falhou` com a instrução de correção manual (fallback previsto em
§8.2). Toda a camada acima do motor — pipeline, garantias, UI, testes — está
pronta e o motor é injetável (`src/correcao/motor.ts`), então integrar um build
real não toca em nenhuma outra parte do código (spec §15).
