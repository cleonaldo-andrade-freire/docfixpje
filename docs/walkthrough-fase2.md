# Walkthrough — Fase 2 (Correção automática)

Estado: **pipeline, UI e testes completos.** O único ponto pendente é um build
funcional de Ghostscript-WASM (ver "Pendência técnica"). Sem ele, a Fase 2 opera
em degradação graciosa e a Fase 1 continua íntegra.

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
  │  carregarMotor()  →  MotorPdf  (injetável; hoje: MotorIndisponivel)
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

## Onde ligar o motor real

**Um arquivo:** `src/correcao/motor.ts` → função `criarMotorReal()`.
Hoje retorna `null` (→ `MotorIndisponivel`). Implementação esperada:

```ts
async function criarMotorReal(): Promise<MotorPdf | null> {
  const gs = await import(/* @vite-ignore */ '<pacote-ghostscript-wasm>');
  // instanciar com o .wasm servido de /motores/gs.<hash>.wasm (mesma origem),
  // FS virtual: escrever /entrada.pdf, rodar args, ler /saida.pdf
  return {
    async executar(entrada, args) { /* … */ return { codigo, bytes, log }; },
  };
}
```

Nada mais muda: `corrigirPdf`, a UI, o worker e os testes já falam só com a
interface `MotorPdf` (spec §15). O `.wasm` entra como asset estático versionado
por hash, com `Cache-Control: immutable` e `Access-Control-Allow-Origin`
restrito ao domínio oficial (acrescentar em `public/_headers`).

### Pendência técnica

`@jspawn/ghostscript-wasm@0.0.2` (o único pacote npm de Ghostscript-WASM) é
pré-alfa e não instancia — nem em Node, nem de forma confiável no navegador.
Opções para destravar: compilar Ghostscript→WASM de fonte via emsdk, ou aguardar
um pacote maduro. Enquanto isso, "Tentar corrigir" leva a `correcao_falhou` com
a instrução de correção manual (fallback previsto em §8.2).

## Testar

```bash
npm test                 # inclui 43 testes de correção (pipeline + UI)
npm run test:e2e         # inclui tests/e2e/correcao.spec.ts (5 x 4 projetos)
npm run test:bundle      # entrada < 120 KB gz, total < 300 KB gz, ZERO .wasm
```

**Gancho de e2e:** `?e2e=1` na URL injeta um motor falso (`ganchoE2E.ts`) que
remove a assinatura preservando o texto — só para o Playwright exercitar o fluxo
`corrigido`. Sem o parâmetro, o gancho nunca roda.

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
