# Walkthrough — Fase 2 (Correção automática)

Estado: **completa e funcionando.** O Ghostscript-WASM está embarcado e a
correção real foi comprovada por e2e (Chromium): `assinado.pdf` → "Tentar
corrigir" → "Corrigido — revalidado com sucesso", texto preservado, sem rede.
Se o motor estiver indisponível, a Fase 2 degrada para `correcao_falhou` +
instrução manual e a Fase 1 continua íntegra.

## Decisões (docs/decisoes/)

- **P2-0 — Licença:** aplicação sob **AGPL-3.0** (`LICENSE` na raiz). A obrigação
  da AGPL já estava satisfeita porque o projeto seria open source de qualquer
  forma. Motor pretendido: Ghostscript-WASM.
- **P2-1 — COOP/COEP e mídia:** **não** ativar COEP. **Sem** recodificação
  automática de MP3/MP4 — só orientação textual (permitido pela spec §8.2).

## Arquitetura da correção

```
UI (BotaoCorrigir "Tentar corrigir")
  │
corrigirArquivo()  ── cripto / mídia → nao_corrigivel (sem worker)
  │                                    motor indisponível → correcao_falhou + manual
  │  timeout (LIMITES.TIMEOUT_CORRECAO_PDF_MS) → aborta o worker, correcao_falhou
  ▼
pdf.worker  (o MESMO worker da validação — pdf-lib embarcado uma vez só)
  │  carregarMotor() → Ghostscript-WASM via motorGs.ts (se indisponível: MotorIndisponivel)
  ▼
corrigirPdf()   UMA invocação do motor por tentativa (spec §8.1)
  ├─ precisa comprimir? itera COMPRESSAO_TENTATIVAS, para no 1º < limite
  ├─ argumentosGs()  → -dPDFA=2 -sDEVICE=pdfwrite -dPDFSETTINGS=<nível> …
  ├─ revalidar()     → roda os MESMOS validadores da Fase 1 no arquivo de saída
  ├─ textoPreservado() → Jaccard sobre o texto extraído (bloqueante p/ assinado)
  └─ sucesso = revalidacao.apto && (!assinado || textoPreservado)   NUNCA o código do motor
```

### Garantias (spec §8.3 / regra `correcao-honesta.md`)

| Garantia | Onde | Teste |
|---|---|---|
| Revalidação obrigatória do output | `revalidar.ts` | `corrigirPdf.test.ts` |
| Sem sucesso falso (motor devolve 0 mas output reprova → `correcao_falhou`) | `corrigirPdf.ts` | "teste mais importante" em `corrigirPdf.test.ts` |
| Original preservado + nome distinto (`-corrigido.pdf`) | `App.tsx`, `nomeCorrigido.ts` | `corrigirPdf.test.ts`, `App.correcao.test.tsx` |
| Aviso legal 1× por sessão | `AvisoLegalCorrecao` + `App` | `App.correcao.test.tsx`, e2e |
| Timeout aborta o worker | `executarComTimeout.ts` + `corrigirArquivo.ts` | `corrigirArquivo.test.ts` |
| Sem rede | worker + CSP `connect-src 'self'` | `tests/e2e/correcao.spec.ts` |
| Preservação de texto | `preservacaoTexto.ts` | `corrigirPdf.test.ts`, `preservacaoTexto.test.ts` |

## Motor (Ghostscript-WASM)

- **Pacote:** `@jspawn/ghostscript-wasm` (AGPL-3.0), pinado. Funciona no
  navegador; **não** em Node — por isso os testes unitários usam um motor dublê
  e a prova real é `tests/e2e/correcao-real.spec.ts` (Chromium).
- **`scripts/preparar-motor.ts`** (roda no `postinstall`/`prebuild`): copia
  `gs.<hash>.wasm` (~15 MB) + o glue Emscripten para `public/motores/` e escreve
  `src/config/motores.ts` com o caminho. O `.wasm` é **gerado, não commitado**.
- **`src/correcao/motorGs.ts`** adapta o build à interface `MotorPdf`: import
  em runtime de `/motores/gs.mjs` (fora do bundler), FS virtual
  (`/entrada.pdf` → `callMain(args)` → `/saida.pdf`). Carregado sob demanda, no
  worker.
- **`public/_headers`:** `/motores/*.wasm` → `Cache-Control: immutable` +
  `Access-Control-Allow-Origin` restrito + `CORP: same-origin`.
- **Preservação de texto:** `fflate` infla os content streams `/FlateDecode` da
  saída do Ghostscript antes de comparar (`preservacaoTexto.ts`).

Trocar de motor (ex.: um Ghostscript compilado de fonte via emsdk, se o build
atual se mostrar limitado) = trocar `motorGs.ts`. Nada mais (spec §15).

## Testar

```bash
npm test                 # 200 testes (inclui correção: pipeline + UI + preservação de texto)
npm run test:e2e         # inclui correcao.spec.ts (motor dublê) e correcao-real.spec.ts (Ghostscript real)
npm run test:bundle      # entrada enxuta; .wasm isolado em /motores/, fora de /assets/ e do index.html
```

**Ganchos de e2e** (nunca rodam em produção): `?e2e=1` injeta um motor dublê de
sucesso, `?e2e=falha` um de falha — só para dar determinismo à UI. A correção
**real** (Ghostscript-WASM) roda sem parâmetro nenhum e é coberta por
`tests/e2e/correcao-real.spec.ts`.

## Constantes novas (`src/config/limites.ts`)

| Constante | Padrão | Efeito |
|---|---|---|
| `LIMITES.LIMIAR_PRESERVACAO_TEXTO` | `0.98` | Similaridade mínima texto antes/depois para "preservado". |
| `COMPRESSAO_TENTATIVAS` | ebook 150 → ebook 120 → screen 72 → screen 60 | Níveis de compressão, em ordem. |
| `DPI_AVISO_RESOLUCAO` | `100` | Abaixo disso, avisa que a resolução das imagens caiu. |

## Evidências

`docs/evidencias/` — 20 screenshots (desktop/mobile × claro/escuro): tela
inicial, aguardando, validado, **corrigido**, e estados de falha
(`correcao_falhou` + `nao_corrigivel`).
