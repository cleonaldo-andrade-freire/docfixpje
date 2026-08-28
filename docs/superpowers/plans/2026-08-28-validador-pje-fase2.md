# Validador PJe — Fase 2 (Correção automática) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Pré-condição:** a Fase 1 (`2026-08-28-validador-pje-fase1.md`) está em produção, verde de ponta a ponta. **Não iniciar a Task P2-1 antes de a Task P2-0 (decisão de licença) estar aprovada e registrada como Artifact.**

**Goal:** Adicionar correção automática no navegador dos PDFs reprovados — remover assinatura, converter para PDF/A-2b e comprimir para ≤ 10 MB numa **única passada** do Ghostscript-WASM carregado sob demanda — sempre revalidando o arquivo de saída pelos mesmos validadores da Fase 1 antes de reportar sucesso; e (se viável) recodificar MP3/MP4 acima do limite com `ffmpeg.wasm`.

**Architecture:** O motor de correção roda num Web Worker dedicado, criado e terminado por operação (libera memória linear do WASM por construção, spec §9.2). O binário `.wasm` é asset estático versionado por hash, servido pela própria origem, cacheado pelo service worker por allowlist. A camada de correção é `(ArrayBuffer, Ocorrencia[], config) => Promise<ResultadoCorrecao>` — desacoplada da UI e do motor concreto (spec §15). Nenhuma correção reporta sucesso sem `revalidar()` reprovar/aprovar de verdade (spec §8.3.1–2, rule `correcao-honesta.md`).

**Tech Stack:** herdada da Fase 1 + Ghostscript compilado para WebAssembly (pacote e licença definidos na Task P2-0), `ffmpeg.wasm` build single-thread (spec §16.8), `pdfjs-dist` (devDependency de teste — extração de texto para o teste de preservação).

**Spec:** `docs/spec/2026-08-28-validador-pje-especificacao.md` — §1.3, §6, §8, §10.1, §14.3, §14.5.

## Global Constraints

- Todas as constraints da Fase 1 continuam valendo.
- **Uma passada, não três** (spec §8.1): as três correções de PDF acontecem numa **única invocação** do motor, com todos os parâmetros simultâneos. Verificável por espião: o motor é chamado exatamente 1× por tentativa.
- **Revalidação obrigatória do output** pelos validadores da Fase 1, do zero (spec §8.3.1). Ausência de exceção **não** é sucesso (spec §8.3.2).
- **Original intocado**, disponível para download junto com o corrigido (spec §8.3.3). Nome de saída distinto: `nome.pdf` → `nome-corrigido.pdf` (spec §8.3.4).
- **Timeout** por operação, `LIMITES.TIMEOUT_CORRECAO_PDF_MS` (padrão 120 s); estourou → aborta, termina o worker, `correcao_falhou` (spec §8.3.6).
- **Sem rede**: `.wasm` servido pela própria origem, nenhum CDN (spec §8.3.7). Nenhuma constante numérica nova fora de `src/config/limites.ts`.
- **Preservação de texto é requisito** (spec §8.2): teste bloqueante que extrai texto antes/depois.
- **WASM carregado sob demanda**: nunca no bundle inicial; só ao clicar "Tentar corrigir" (spec §8.2, §14.5). "Carregando o motor de correção…" só na primeira correção da sessão (spec §6).
- Estados novos e transições conforme a máquina da Fase 1 (`inapto → corrigindo → corrigido | correcao_falhou | nao_corrigivel`).

---

## File Structure (acréscimos à Fase 1)

```
docs/decisoes/
  2026-XX-XX-licenca-motor-correcao.md      # P2-0 (Artifact)
  2026-XX-XX-coop-coep-ffmpeg.md            # P2-1
public/
  _headers                                  # + COEP e ACAO dos .wasm (P2-2)
public/motores/                             # binários .wasm versionados por hash (P2-2)
src/config/limites.ts                       # + COMPRESSAO_TENTATIVAS, MARGEM_BITRATE etc
src/correcao/
  motorGs.ts                                # carregador lazy do Ghostscript-WASM
  argumentosGs.ts                           # monta a linha de comando única a partir das ocorrências
  corrigirPdf.ts                            # orquestra a passada única + tentativas de compressão
  revalidar.ts                              # roda validarArquivo() no output
  preservacaoTexto.ts                       # comparação de texto (usa pdfjs-dist em teste)
  corrigirMidia.ts                          # ffmpeg.wasm sob demanda (ou stub de orientação textual)
  corrigirArquivo.ts                        # entrypoint: (bytes, ocorrencias, config) => ResultadoCorrecao
  protocoloCorrecao.ts                      # mensagens worker<->main
src/workers/
  correcao.worker.ts                        # roda o motor; 1 worker por operação
src/ui/
  BotaoCorrigir.tsx                         # "Tentar corrigir" / "Baixar arquivo corrigido"
  AvisoLegalCorrecao.tsx                    # nota da 1a correção da sessão (§8.3.5)
  ConfirmacaoMidia.tsx                      # estimativa de tempo + confirmar/cancelar (§8.2)
tests/e2e/
  correcao.spec.ts
  rede-correcao.spec.ts
  evidencias-fase2.spec.ts
tests/bundle/
  entradaSemWasm.test.ts
```

---

## Task P2-0: Decisão de licença do motor de correção (BLOQUEANTE, Artifact)

**Files:**
- Create: `docs/decisoes/2026-XX-XX-licenca-motor-correcao.md`

**Interfaces:** nenhuma (documento de decisão). Nenhum código depende dele, mas **nenhuma outra task da Fase 2 começa antes da aprovação**.

- [ ] **Step 1: Levantar as opções** e registrar no documento:
  - **A — Ghostscript-WASM sob AGPL-3.0.** Como a aplicação já será open source (spec §10.4, §13), a obrigação da AGPL de disponibilizar o código-fonte da aplicação inteira **já está satisfeita por escolha do projeto**. Ação: publicar a aplicação sob **AGPL-3.0**, `LICENSE` no repo, aviso de licença na UI (rodapé) e link para o fonte. Cobre remover assinatura + PDF/A + compressão.
  - **B — MuPDF-WASM (`mupdf`).** Também AGPL; mesma conclusão da opção A, com API diferente. Sabe reescrever/limpar mas conversão PDF/A é mais trabalhosa.
  - **C — Permissiva (qpdf/pdfcpu em WASM, Apache-2.0/MIT).** Faz remoção de assinatura (reescrita), linearização e compressão de streams, **mas não converte para PDF/A** (sem embutir OutputIntent/fontes conforme ISO 19005). Adotar C = abrir mão da correção automática da Regra 3, deixando PDF/A só como orientação manual.
- [ ] **Step 2: Recomendação registrada.** Recomendado: **opção A (Ghostscript-WASM + AGPL-3.0)**, por cobrir os três casos numa passada e a exigência de licença já estar atendida. Documentar o pacote npm exato escolhido, sua versão, a origem do `.wasm` (repositório e checksum) e como ele é reproduzível a partir do fonte.
- [ ] **Step 3: Aprovação humana** anexada ao documento (data + quem aprovou). Só então seguir para P2-1.
- [ ] **Step 4: Commit** — `git commit -m "docs: decisão de licença do motor de correção (spec §1.3)"`

---

## Task P2-1: Spike COOP/COEP + `SharedArrayBuffer` + hospedagem (Artifact)

**Files:**
- Create: `docs/decisoes/2026-XX-XX-coop-coep-ffmpeg.md`
- Create (throwaway, não commitado): `spike/` com página mínima que carrega o build escolhido do motor

**Interfaces:** decisão registrada que P2-2, P2-3 e P2-13 consomem.

- [ ] **Step 1:** Testar o build do Ghostscript-WASM da P2-0 **sem** COOP/COEP. Ghostscript-WASM em geral **não** exige `SharedArrayBuffer`. Confirmar: instancia e roda uma conversão simples num worker com os `_headers` atuais da Fase 1. Registrar resultado.
- [ ] **Step 2:** Testar `ffmpeg.wasm` **single-thread** (`@ffmpeg/core` single-thread) sem COOP/COEP. Medir tempo de recodificar um MP4 sintético de ~2 min. Registrar.
- [ ] **Step 3: Decisão.** Preferência (spec §16.8): **não** ativar COEP; usar Ghostscript-WASM (sem SAB) + `ffmpeg.wasm` single-thread. Se o tempo single-thread for inaceitável (> ~5 min p/ vídeo curto): **Fase 2 entrega MP3/MP4 apenas com orientação textual** (permitido por spec §8.2) e a Task P2-13 vira só o texto. Registrar qual caminho foi escolhido e por quê.
- [ ] **Step 4:** Se, e somente se, COEP for inevitável: documentar impacto (todos os assets precisam `Cross-Origin-Resource-Policy`/`crossorigin`, `<img>` de terceiros quebram — não há; provedor precisa permitir os headers) e validar no Cloudflare Pages. Caso contrário, marcar "COEP: não aplicável".
- [ ] **Step 5: Commit** — `git commit -m "docs: spike de COOP/COEP e decisão sobre correção de mídia (spec §8.2, §16.8)"`

---

## Task P2-2: Assets WASM — versionamento, service worker, cabeçalhos

**Files:**
- Modify: `public/_headers`, `src/sw.ts`, `vite.config.ts`
- Create: `public/motores/README.md` (proveniência e checksum do `.wasm`), `scripts/baixar-motor.ts` (copia o `.wasm` do pacote npm para `public/motores/` com nome `nome.<hash>.wasm`)
- Test: `src/sw.test.ts` (estender), `tests/headers/headersConfig.test.ts` (estender)

**Interfaces:**
- Produces: `export const CAMINHO_MOTOR_GS: string` em `src/config/limites.ts` (ou `src/config/motores.ts` — arquivo de config, ainda "um lugar só") apontando para `/motores/gs.<hash>.wasm`.

- [ ] **Step 1: Testes (red):**
  - `podeCachear('/motores/gs.abc123.wasm', origem) === true`; `podeCachear('/motores/qualquer-outro', origem)` conforme allowlist literal.
  - `headersConfig.test.ts`: `/motores/*` tem `Cache-Control: public, max-age=31536000, immutable` **e** `Access-Control-Allow-Origin` = domínio próprio (não `*`) — spec §10.1.
  - `sw` **não** cacheia resposta com `content-type` de PDF nem `blob:` (já coberto na Fase 1; reforçar).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar:**
  - `scripts/baixar-motor.ts` roda no `postinstall`/CI, calcula hash do `.wasm`, grava em `public/motores/gs.<hash>.wasm`, escreve `src/config/motores.ts` com `CAMINHO_MOTOR_GS`.
  - `_headers`: bloco `/motores/*` com `immutable` + `Access-Control-Allow-Origin: https://<dominio-oficial>`. Adicionar `Cross-Origin-Embedder-Policy` **somente** se a P2-1 disser que é necessário.
  - `sw.ts`: allowlist inclui `/motores/` por prefixo **exato** (não regex genérica) e só extensão `.wasm`.
- [ ] **Step 4: Rodar e ver passar** + `npm run build` (confere `dist/motores/gs.<hash>.wasm` presente).
- [ ] **Step 5: Commit** — `git commit -m "feat: assets WASM versionados por hash, cache imutável e ACAO restrito (spec §8.3.7, §10.1)"`

---

## Task P2-3: `src/correcao/motorGs.ts` — carregador lazy do Ghostscript-WASM

**Files:**
- Create: `src/correcao/motorGs.ts`
- Test: `src/correcao/motorGs.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SaidaMotor { codigo: number; bytes: Uint8Array | null; stderr: string; }
  export interface MotorGs {
    executar(entrada: Uint8Array, args: string[]): Promise<SaidaMotor>;
  }
  // carrega o .wasm de CAMINHO_MOTOR_GS via fetch same-origin; memoiza a Promise por sessão.
  export function carregarMotorGs(onProgresso?: (frac: number) => void): Promise<MotorGs>;
  export function motorJaCarregado(): boolean;   // p/ decidir a etapa "Carregando o motor…"
  export function __resetMotorParaTeste(): void;
  ```
- `executar` roda o Ghostscript com `-dNOPAUSE -dBATCH -dQUIET -sDEVICE=pdfwrite -sOutputFile=/saida.pdf <args> /entrada.pdf` (args exatos vindos da Task P2-4), lê `/saida.pdf` do FS virtual, devolve bytes + código.
- **Não** é importado por nenhum módulo carregado no boot: só `import()` dinâmico dentro do worker de correção.

- [ ] **Step 1: Testes:**
  - `motorJaCarregado() === false` antes de qualquer chamada.
  - `carregarMotorGs()` duas vezes → o `.wasm` é buscado **uma** vez (espião em `fetch`/`instantiateStreaming`), `motorJaCarregado() === true` depois.
  - `executar(pdfSimples, argsConversao)` → `codigo === 0` e `bytes` começa com `%PDF-`.
  - (integração, pode ser `test.skipIf(!temWasm)`) roda com o `.wasm` real de `public/motores/`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** o wrapper sobre o pacote da P2-0 (API concreta depende do pacote; encapsular toda a especificidade aqui).
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `git commit -m "feat: carregador lazy e memoizado do Ghostscript-WASM (spec §8.2)"`

---

## Task P2-4: `src/correcao/argumentosGs.ts` — a linha de comando única

**Files:**
- Create: `src/correcao/argumentosGs.ts`
- Modify: `src/config/limites.ts` → `export const COMPRESSAO_TENTATIVAS` (ver abaixo)
- Test: `src/correcao/argumentosGs.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface NivelCompressao { rotulo: string; pdfsettings: '/ebook' | '/screen'; dpi: number | null; }
  export function argumentosGs(params: {
    ocorrencias: Ocorrencia[];
    nivel: NivelCompressao;        // qual tentativa de compressão
    parteAlvoPdfa: 2;              // sempre PDF/A-2b (spec §8.2)
  }): string[];
  ```
- `COMPRESSAO_TENTATIVAS: NivelCompressao[]` em `limites.ts` (spec §8.2):
  ```ts
  [
    { rotulo: 'ebook 150 dpi',  pdfsettings: '/ebook',  dpi: 150 },
    { rotulo: 'ebook 120 dpi',  pdfsettings: '/ebook',  dpi: 120 },
    { rotulo: 'screen 72 dpi',  pdfsettings: '/screen', dpi: 72  },
    { rotulo: 'screen 60 dpi',  pdfsettings: '/screen', dpi: 60  },
  ]
  ```
- Args **sempre** incluem, numa passada só (spec §8.1):
  ```
  -dPDFA=2 -dPDFACompatibilityPolicy=1
  -sColorConversionStrategy=UseDeviceIndependentColor
  -sDEVICE=pdfwrite
  -dPDFSETTINGS=<nivel.pdfsettings>
  ```
  + quando `nivel.dpi`: `-dDownsampleColorImages=true -dColorImageResolution=<dpi>` (e Gray/Mono equivalentes).
  A reescrita já descarta assinatura e `/Perms` como efeito colateral (spec §8.1) — não há flag específica; garantir que **não** há `-dPreserveAnnots` que reintroduza o widget de assinatura.
- A função **não** ramifica "3 operações": ela sempre produz o conjunto completo; `ocorrencias` só afeta detalhes (ex.: se não há `PDFA_*`, ainda assim converte para PDF/A-2b — spec §8.1 diz para reescrever tudo de uma vez).

- [ ] **Step 1: Testes:** para ocorrências `[ASSINATURA_PRESENTE, PDFA_NAO_DECLARADO, TAMANHO_EXCEDIDO]` e `nivel = COMPRESSAO_TENTATIVAS[0]` → array contém `-dPDFA=2`, `-dPDFSETTINGS=/ebook`, `-dColorImageResolution=150`, `-sDEVICE=pdfwrite`; **não** contém nenhuma flag que preserve assinatura. Para `nivel[2]` → `/screen` e `72`. Snapshot da lista completa por nível.
- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: argumentos Ghostscript para a passada única (spec §8.1, §8.2)`.

---

## Task P2-5: `src/correcao/revalidar.ts` — revalidação obrigatória do output

**Files:**
- Create: `src/correcao/revalidar.ts`
- Test: `src/correcao/revalidar.test.ts`

**Interfaces:**
- Consumes: `validarArquivo` (Fase 1, Task 13).
- Produces:
  ```ts
  export async function revalidar(nomeSaida: string, bytesSaida: Uint8Array, config): Promise<{
    apto: boolean; ocorrencias: Ocorrencia[];
  }>;
  ```
- Roda `validarArquivo` do zero no output. Sem heurística, sem atalho.

- [ ] **Step 1: Testes:** dado `pdfa-2b-valido.pdf` (fixture) → `{ apto: true, ocorrencias: [] }`. Dado `assinado.pdf` → `apto: false` com `ASSINATURA_PRESENTE`. É literalmente um passthrough tipado — o teste garante que **não** foi introduzida nenhuma lógica de "confiança".
- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: revalidação do arquivo corrigido pelos mesmos validadores (spec §8.3.1)`.

---

## Task P2-6: `src/correcao/preservacaoTexto.ts` — teste bloqueante de texto

**Files:**
- Create: `src/correcao/preservacaoTexto.ts`
- Modify: `package.json` → devDep `pdfjs-dist` (pinada)
- Test: `src/correcao/preservacaoTexto.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function normalizarTexto(t: string): string;  // colapsa espaços, remove hifenização de quebra
  export async function extrairTexto(bytes: Uint8Array): Promise<string>; // pdfjs-dist
  export async function textoPreservado(antes: Uint8Array, depois: Uint8Array): Promise<{
    preservado: boolean; similaridade: number; // 0..1
  }>;
  ```
- `preservado` quando `similaridade >= LIMIAR_PRESERVACAO_TEXTO` (constante em `limites.ts`, padrão `0.98`). Similaridade = razão de tokens em comum (Jaccard sobre palavras normalizadas) — barata e suficiente.

- [ ] **Step 1: Testes (spec §14.3, bloqueante):**
  - `assinado.pdf` corrigido pela passada única real (usa `corrigirPdf` — dependência circular controlada: este teste vive em `tests/integracao/` e importa ambos) → `textoPreservado(original, corrigido)` `preservado === true`.
  - Caso negativo: um PDF rasterizado sintético (imagem, zero texto) vs original com texto → `preservado === false`. Garante que o teste **detecta** perda.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** extração com `pdfjs-dist` (worker desligado no ambiente de teste), normalização e Jaccard.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `git commit -m "feat: verificação de preservação de texto pós-correção (spec §8.2, §14.3)"`

---

## Task P2-7: `src/correcao/corrigirPdf.ts` — passada única + tentativas de compressão

**Files:**
- Create: `src/correcao/corrigirPdf.ts`
- Test: `src/correcao/corrigirPdf.test.ts`

**Interfaces:**
- Consumes: `carregarMotorGs` (P2-3), `argumentosGs` + `COMPRESSAO_TENTATIVAS` (P2-4), `revalidar` (P2-5), `textoPreservado` (P2-6), `LIMITES`.
- Produces:
  ```ts
  export interface ProgressoCorrecao { (etapa: string): void; }
  export async function corrigirPdf(params: {
    nomeArquivo: string; bytes: Uint8Array; ocorrencias: Ocorrencia[]; config;
    motor: MotorGs;                    // injetado (worker cria via carregarMotorGs)
    onEtapa: ProgressoCorrecao;
  }): Promise<ResultadoCorrecao>;
  ```
- Algoritmo:
  1. `precisaComprimir = bytes.length > LIMITES.TAMANHO_MAX_BYTES || ocorrencias.some(o => o.codigo === 'TAMANHO_EXCEDIDO')`.
  2. Tentativas: se `precisaComprimir`, itera `COMPRESSAO_TENTATIVAS` (índice `k`), `onEtapa(\`Comprimindo — tentativa ${k+1} de ${COMPRESSAO_TENTATIVAS.length}…\`)`; senão faz **uma** tentativa com `COMPRESSAO_TENTATIVAS[0]` e etapas `"Removendo a assinatura…"` / `"Convertendo para PDF/A…"` (mensagens da spec §6, exibidas em torno da mesma invocação).
  3. Cada tentativa = **uma** `motor.executar(bytes, argumentosGs({ ocorrencias, nivel, parteAlvoPdfa: 2 }))`. `codigo !== 0` → tenta próxima; sem próxima → `sucesso:false`.
  4. Se `precisaComprimir`: aceita a primeira saída com `tamanhoDepois <= TAMANHO_MAX_BYTES`. Se `nivel.dpi <= 100` e foi aceita → `avisos.push('A resolução das imagens foi reduzida para caber no limite; confira a legibilidade antes de protocolar.')` (spec §8.2).
  5. `onEtapa('Revalidando o arquivo corrigido…')` → `revalidar(nome-corrigido, saida, config)`.
  6. `onEtapa` para texto → `textoPreservado(bytes, saida)`.
  7. Monta `ResultadoCorrecao` (spec §12): `tentada:true`, `estrategias` derivadas das ocorrências (`REMOVER_ASSINATURA` se havia assinatura, `CONVERTER_PDFA` sempre, `COMPRIMIR_PDF` se comprimiu), `sucesso = revalidacao.apto && (!ehAssinado || textoPreservado.preservado)`, `tamanhoAntes/Depois`, `textoPreservado`, `avisos`, `duracaoMs`, `revalidacao`.
  8. **`sucesso` é sempre função de `revalidacao.apto`** — nunca do código do motor (spec §8.3.2).
  9. Compressão esgotou 4 tentativas sem ficar sob o limite → `sucesso:false`, `avisos.push(\`Menor tamanho alcançado: ${menor} bytes. Considere dividir o documento em partes.\`)` (spec §8.2).

- [ ] **Step 1: Testes (spec §14.3)** com `MotorGs` **mockado** (determinístico) + alguns com o real em `tests/integracao/`:
  - assinado + não-PDF/A + acima do limite → `motor.executar` chamado **exatamente 1×** por tentativa; `sucesso:true`; `estrategias` contém os três; `revalidacao.apto:true`. Espião confirma 1 invocação (não 3).
  - motor retorna `codigo:0` mas bytes que a revalidação reprova (mock) → `sucesso:false`, estado destino `correcao_falhou`. **Teste mais importante da suíte.**
  - 25 MB com imagens → `sucesso:true`, `tamanhoDepois < 10_485_760`, `avisos` contém aviso de resolução.
  - impossível comprimir sob o limite em 4 tentativas (mock devolve sempre 11 MB) → `sucesso:false`, aviso com menor tamanho, `motor.executar` chamado 4×.
  - não-PDF/A simples (abaixo do limite) → 1 invocação, `pdfaParte`/`pdfaConformidade` preenchidos na revalidação, sem erro de Nível 2.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `git commit -m "feat: correção de PDF em passada única com tentativas de compressão e revalidação (spec §8.1, §8.2, §8.3, §14.3)"`

---

## Task P2-8: `src/workers/correcao.worker.ts` + timeout e aborto

**Files:**
- Create: `src/workers/correcao.worker.ts`, `src/correcao/protocoloCorrecao.ts`
- Create: `src/correcao/executarComTimeout.ts`
- Test: `src/correcao/executarComTimeout.test.ts`, `src/workers/correcao.worker.test.ts`

**Interfaces:**
- `protocoloCorrecao.ts`:
  ```ts
  export type ParaCorrecao = { tipo: 'corrigir'; nomeArquivo: string; buffer: ArrayBuffer; ocorrencias: Ocorrencia[]; config };
  export type DaCorrecao =
    | { tipo: 'motorCarregando'; frac: number }
    | { tipo: 'etapa'; mensagem: string }
    | { tipo: 'resultado'; resultado: ResultadoCorrecao; bufferCorrigido: ArrayBuffer | null }
    | { tipo: 'erro'; mensagem: string };
  ```
- `correcao.worker.ts`: no `onmessage`, `import('../correcao/motorGs')` dinâmico; se `!motorJaCarregado()` → `postMessage({tipo:'etapa', mensagem:'Carregando o motor de correção…'})` (spec §6, só 1ª vez); `carregarMotorGs(frac => postMessage({tipo:'motorCarregando',frac}))`; `corrigirPdf({..., onEtapa: m => postMessage({tipo:'etapa',mensagem:m})})`; posta `resultado` + `bufferCorrigido` **transferido**.
- `executarComTimeout(promessa, ms, aoEstourar)`: `Promise.race` com timer; ao estourar chama `aoEstourar()` (no orquestrador: `worker.terminate()`), resolve com sentinela `TIMEOUT`.

- [ ] **Step 1: Testes:**
  - `executarComTimeout`: promessa que nunca resolve + `ms=10` → resolve `TIMEOUT`, `aoEstourar` chamado 1×.
  - worker (`@vitest/web-worker`): mandar `corrigir` com `simples.pdf` → recebe `etapa` "Carregando o motor de correção…" **só na primeira vez** (segunda mensagem de correção na mesma instância não repete — mas como cada operação usa worker novo, testar via `motorJaCarregado` no módulo).
- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: worker de correção com timeout e aborto (spec §8.3.6)`.

---

## Task P2-9: `src/correcao/corrigirArquivo.ts` — entrypoint desacoplado + `nao_corrigivel`

**Files:**
- Create: `src/correcao/corrigirArquivo.ts`
- Test: `src/correcao/corrigirArquivo.test.ts`

**Interfaces:**
- Produces (assinatura da spec §15):
  ```ts
  export interface CallbacksCorrecao {
    onEtapa: (m: string) => void;
    onMotorCarregando?: (frac: number) => void;
  }
  export function corrigirArquivo(
    nomeArquivo: string, bytes: ArrayBuffer, ocorrencias: Ocorrencia[], config,
    cb: CallbacksCorrecao, fabricaWorker?: () => Worker,
  ): Promise<{ resultado: ResultadoCorrecao; bufferCorrigido: ArrayBuffer | null; estadoDestino: EstadoLinha }>;
  ```
- Regras:
  - Se `ocorrencias` tem `ARQUIVO_CRIPTOGRAFADO` ou `PDFA_CRIPTOGRAFADO` → **não chama worker**; retorna `estadoDestino:'nao_corrigivel'`, `resultado.tentada:false`, orientação "Remova a proteção por senha no aplicativo de origem e valide de novo." (spec §8.2).
  - MP3/MP4 com só `TAMANHO_EXCEDIDO` → delega a `corrigirMidia` (P2-13).
  - Caso PDF corrigível → cria worker (`fabricaWorker` default aponta `correcao.worker.ts`), encaminha via protocolo, `executarComTimeout(..., LIMITES.TIMEOUT_CORRECAO_PDF_MS, () => worker.terminate())`; `TIMEOUT` → `estadoDestino:'correcao_falhou'`, `resultado.avisos=['A correção passou do tempo limite e foi interrompida.']`; `finally { worker.terminate() }`.
  - `estadoDestino = resultado.sucesso ? 'corrigido' : 'correcao_falhou'`.

- [ ] **Step 1: Testes** (`fabricaWorker` fake):
  - cripto → `estadoDestino:'nao_corrigivel'`, worker **não** criado (espião).
  - fake worker que demora mais que o timeout (timeout reduzido via config de teste) → `estadoDestino:'correcao_falhou'`, `terminate` chamado, `Promise` resolve (não rejeita).
  - fake worker que devolve `resultado.sucesso:true` → `estadoDestino:'corrigido'`, `bufferCorrigido` não-nulo.
  - após operação, `terminate` sempre chamado (nenhum worker vivo — spec §14.3/§9.2).
- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: entrypoint de correção desacoplado, com nao_corrigivel e timeout (spec §8.2, §8.3.6, §15)`.

---

## Task P2-10: UI — "Tentar corrigir", estados de correção, "Baixar arquivo corrigido"

**Files:**
- Create: `src/ui/BotaoCorrigir.tsx`, `src/ui/AvisoLegalCorrecao.tsx`
- Modify: `src/ui/Diagnostico.tsx` (troca a nota "chega na próxima versão" pelo botão), `src/estado/store.ts` (ações `corrigir`, `corrigido`, `correcaoFalhou`, `naoCorrigivel`, `etapaCorrecao`), `src/App.tsx`
- Test: `src/ui/BotaoCorrigir.test.tsx`, `src/App.correcao.test.tsx`

**Interfaces:**
- `store.ts` novas ações usam `transicionar` (`inapto→corrigindo`, `corrigindo→corrigido|correcao_falhou|nao_corrigivel`). `ItemArquivo` ganha `bufferCorrigidoNome: string | null` e o download é criado via `blobRegistry.criarDownload(id, new Blob([buffer]), \`${base}-corrigido.pdf\`)` (spec §8.3.4).
- `BotaoCorrigir`: quando `estado === 'inapto' && resultado.corrigivel` → botão "Tentar corrigir"; quando `estado === 'corrigido'` → link/ботão "Baixar arquivo corrigido" (usa a Blob URL do registry) **e** continua oferecendo "Baixar original" (spec §8.3.3); `nao_corrigivel`/`apto` → sem botão (spec §14.2).
- `AvisoLegalCorrecao`: renderizado **uma vez por sessão**, na primeira transição para `corrigindo` (flag em memória no provider, não persistida). Texto curto, não-modal (spec §8.3.5), com o teor sobre QR/código de verificação.
- `App`: ao clicar "Tentar corrigir" → `dispatch({t:'corrigir', id})`; chama `corrigirArquivo(nome, await file.arrayBuffer(), resultado.ocorrencias, config, { onEtapa: m => dispatch({t:'etapaCorrecao', id, m}), onMotorCarregando })`; no fim despacha o estado destino e, se `corrigido`, registra o download. Sequencial: desabilita "Tentar corrigir" das outras linhas enquanto uma correção roda (spec §5, §10.2).

- [ ] **Step 1: Testes (spec §14.2, §14.3):**
  - linha `apto` → sem botão; linha `nao_corrigivel` → sem botão; linha `inapto` corrigível → "Tentar corrigir".
  - clicar "Tentar corrigir" (com `corrigirArquivo` mockado resolvendo `corrigido`) → linha passa por `corrigindo` (com `role=status` e mensagem de etapa), termina "Corrigido — revalidado com sucesso" (`CirculoCheck`), aparecem "Baixar arquivo corrigido" e "Baixar original".
  - `AvisoLegalCorrecao` aparece na 1ª correção e **não** reaparece na 2ª.
  - mock resolvendo `correcao_falhou` → linha vermelha "Não foi possível corrigir automaticamente" + orientação manual (reusa Task 14).
  - enquanto uma correção roda, "Tentar corrigir" das outras linhas está desabilitado.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** + `npm run lint`.
- [ ] **Step 5: Commit** — `git commit -m "feat: UI de correção — botão, estados, aviso legal e download do corrigido (spec §5, §8.3, §14.2)"`

---

## Task P2-11: `src/correcao/corrigirMidia.ts` — ffmpeg.wasm sob demanda (ou orientação textual)

**Files:**
- Create: `src/correcao/corrigirMidia.ts`, `src/ui/ConfirmacaoMidia.tsx`
- Modify: `src/config/limites.ts` → `MARGEM_BITRATE = 0.05`; `package.json` devDep/dep `@ffmpeg/ffmpeg` + `@ffmpeg/core` single-thread (pinadas) **se** a P2-1 aprovou mídia
- Test: `src/correcao/corrigirMidia.test.ts`, `src/ui/ConfirmacaoMidia.test.tsx`

**Interfaces:**
- **Caminho A (P2-1 aprovou recodificação):**
  ```ts
  export function estimarTempo(bytes: number): { segundos: number };
  export function bitrateAlvo(duracaoSeg: number, limiteBytes: number): number; // com MARGEM_BITRATE
  export async function corrigirMidia(params: {
    nomeArquivo: string; bytes: Uint8Array; tipo: 'audio/mpeg'|'video/mp4'; config;
    onProgresso: (frac: number) => void;   // progresso REAL (spec §8.2)
    sinalCancelar: AbortSignal;            // cancelar encerra o worker (spec §8.2)
    onEtapa: (m: string) => void;
  }): Promise<ResultadoCorrecao>;
  ```
  - Carrega `ffmpeg.wasm` **só aqui**, na primeira chamada. `onProgresso` vem do callback real do ffmpeg, nunca indeterminado. `sinalCancelar.aborted` → `ffmpeg.terminate()` e `sucesso:false`.
  - Revalida o output por tamanho (Regra 2). Sem revalidação de assinatura/PDF/A (não se aplica a mídia).
- **Caminho B (P2-1 recusou):** `corrigirMidia` retorna `{ tentada:false, sucesso:false, avisos:['Para MP3/MP4 acima do limite, reduza a duração ou recodifique com bitrate menor no seu editor.'] }` e `corrigirArquivo` manda `estadoDestino:'nao_corrigivel'` com orientação textual. `ConfirmacaoMidia` não é usado.

- [ ] **Step 1: Testes:**
  - `bitrateAlvo(120, 10_485_760)` → valor coerente e 5% abaixo do teto aritmético.
  - Caminho A: `ConfirmacaoMidia` mostra `estimarTempo` e só chama `onConfirmar` após clique explícito; botão "Cancelar" dispara `AbortController`. `corrigirMidia` com ffmpeg mockado: `onProgresso` recebe frações crescentes; `abort()` no meio → `sucesso:false`, `terminate` chamado.
  - Caminho B: `corrigirArquivo` para MP4 grande → `estadoDestino:'nao_corrigivel'` com o texto de orientação; nenhum import de `@ffmpeg/*` no grafo (teste de bundle P2-12 reforça).
- [ ] **Step 2–5:** falhar → implementar (o caminho escolhido na P2-1) → passar → commit `feat: correção de mídia sob demanda com confirmação e progresso real, ou orientação textual (spec §8.2)`.

---

## Task P2-12: Teste de bundle — entrada sem WASM

**Files:**
- Create: `tests/bundle/entradaSemWasm.test.ts`
- Modify: `tests/bundle/semRedeExterna.test.ts` (estender a allowlist só com `/motores/*.wasm` e assets próprios)

**Interfaces:**
- Após `npm run build`:
  - O chunk de entrada (`dist/assets/index-*.js`) **não** contém o código do motor: nenhuma referência a `gs.<hash>.wasm` fora de um chunk lazy; `@ffmpeg` (se presente) só em chunk lazy. Verificar por: (a) o `.wasm` não aparece em `<script>` do `index.html`; (b) `import()` dinâmico gerou chunk separado (`dist/assets/motorGs-*.js`).
  - Tamanho do chunk de entrada `< 400 KB` gzip (mesmo teto da Fase 1 — a Fase 2 não pode inchar o boot).
  - Nenhuma requisição a host externo no grafo estático (reusa o scanner da Fase 1; `/motores/` e assets próprios permitidos).
- Runtime (Playwright, em P2-13): abrir a app, **sem** clicar corrigir → painel de rede não tem request de `.wasm`.

- [ ] **Step 1: Escrever o teste** (análise de `dist/`).
- [ ] **Step 2: Rodar e ver falhar** (provável: `motorGs` importado estaticamente em algum lugar).
- [ ] **Step 3: Corrigir os imports** para `import()` dinâmico só no worker.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `git commit -m "test: bundle de entrada da Fase 2 sem WASM e dentro do orçamento (spec §14.5)"`

---

## Task P2-13: E2E Playwright — correção, rede e evidências da Fase 2

**Files:**
- Create: `tests/e2e/correcao.spec.ts`, `tests/e2e/rede-correcao.spec.ts`, `tests/e2e/evidencias-fase2.spec.ts`

**Interfaces:**
- `correcao.spec.ts` (spec §14.3), tudo com fixtures sintéticas:
  - `assinado.pdf` → Validar → vermelho → "Tentar corrigir" → linha passa por `corrigindo` (mensagens de etapa visíveis, `role=status` `aria-live=polite`) → "Corrigido — revalidado com sucesso" → "Baixar arquivo corrigido" presente e o original ainda baixável.
  - `assinado-e-sem-pdfa-e-grande.pdf` → após corrigir, revalidação verde; via `window.__espioMotor__` (hook DEV) conferir **1** invocação por tentativa, não 3.
  - fixture que o motor não consegue comprimir sob 10 MB → `correcao_falhou` com menor tamanho no texto.
  - `criptografado.pdf` → `nao_corrigivel`, sem botão corrigir, orientação de remover senha.
  - `imagens-pesadas.pdf` (25 MB) → `corrigido`, download < 10 MB, aviso de resolução visível.
- `rede-correcao.spec.ts` (spec §14.5): interceptar todas as requisições durante upload→Validar→Corrigir→Baixar; assertar que **toda** URL é same-origin; o único `.wasm` vem de `/motores/`. Zero terceiros.
- `evidencias-fase2.spec.ts`: screenshots dos estados `corrigindo`, `corrigido`, `correcao_falhou`, `nao_corrigivel` em desktop/mobile × claro/escuro → `docs/evidencias/`; grava o **ciclo completo** upload → Validar → processando → vermelho → Corrigir → verde → Baixar → Limpar tudo → `docs/evidencias/ciclo-completo.webm` (spec §1.4).

- [ ] **Step 1: Escrever os specs** (red — precisa do hook `window.__espioMotor__` em DEV).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Adicionar o hook de espionagem do motor** (DEV only) e ajustar.
- [ ] **Step 4: Rodar e ver passar**; conferir evidências só com dados fictícios.
- [ ] **Step 5: Commit** — `git commit -m "test(e2e): correção, ausência de rede externa e evidências da Fase 2 (spec §14.3, §14.5, §1.4)"`

---

## Task P2-14: Aviso de licença na UI + walkthrough da Fase 2

**Files:**
- Create: `LICENSE` (conforme P2-0), `docs/walkthrough-fase2.md`
- Modify: `src/ui/AvisoPrivacidade.tsx` ou um rodapé novo → linha de licença + link para o fonte (spec §10.4, e AGPL se P2-0 = opção A); `README.md`

**Interfaces:**
- Rodapé: "Código aberto sob AGPL-3.0 — {link}. Motor de correção: Ghostscript ({versão}, {link})."
- `docs/walkthrough-fase2.md` (spec §1.4): como o motor é carregado sob demanda, onde ficam `CAMPO_MOTOR_GS`/`COMPRESSAO_TENTATIVAS`/`TIMEOUT_CORRECAO_PDF_MS`/`MARGEM_BITRATE` (todas em `src/config/`), como regenerar o `.wasm` a partir do fonte (`scripts/baixar-motor.ts` + checksum), quais cabeçalhos a Fase 2 acrescenta (`/motores/*` ACAO + `immutable`, COEP se aplicável), e como rodar a suíte de correção (`npm test`, `npm run test:e2e`, `npm run test:bundle`).

- [ ] **Step 1:** Escrever `LICENSE`, rodapé e walkthrough.
- [ ] **Step 2:** Revisar contra spec §1.4 e §10.4.
- [ ] **Step 3: Commit** — `git commit -m "docs: licença AGPL, aviso na UI e walkthrough da Fase 2 (spec §1.3, §10.4)"`

---

## Self-Review (contra a spec)

**Cobertura:**
- §1.3 decisão de licença como Artifact → P2-0 ✅
- §6 mensagens de etapa de correção ("Carregando o motor…", "Removendo a assinatura…", "Convertendo para PDF/A…", "Comprimindo — tentativa N de 4…", "Revalidando…") → P2-7, P2-8, P2-10 ✅
- §8.1 uma passada, não três (+ verificação por espião de 1 invocação) → P2-4, P2-7, P2-13 ✅
- §8.2 correção por motivo: assinatura/DocMDP (preservando texto), PDF/A-2b, criptografado→`nao_corrigivel`, compressão 4 níveis com aviso de resolução, mídia sob demanda com confirmação/progresso/cancelar → P2-6, P2-7, P2-9, P2-11 ✅
- §8.3 regras invioláveis (revalidação, sem sucesso falso, original preservado, nome distinto, aviso legal 1ª vez, timeout, sem rede) → P2-5, P2-7, P2-9, P2-10, P2-2 ✅
- §10.1 banda WASM (hash + `immutable` + ACAO restrito) → P2-2 ✅
- §14.3 todos os bullets (incl. "motor código 0 mas revalidação reprova → correcao_falhou", o teste mais importante) → P2-7 Step 1, P2-13 ✅
- §14.5 rede só origem própria + chunk de entrada sem WASM → P2-12, P2-13 ✅
- §1.4 evidências (screenshots dos estados de correção, gravação do ciclo completo) → P2-13 ✅
- §15 corretor `(ArrayBuffer, Ocorrencia[], config) => Promise<ResultadoCorrecao>` desacoplado do motor → P2-9 ✅

**Decisões pendentes que o plano isola:** motor concreto e sua licença (P2-0); recodificação de mídia sim/não e COEP (P2-1). Ambas são gates com Artifact e não bloqueiam a numeração seguinte além do ponto indicado.

**Placeholders:** nenhum. Onde a API do motor concreto é desconhecida (depende de P2-0), a especificidade está confinada a `motorGs.ts` (P2-3) atrás de uma interface fixa (`MotorGs`).

**Consistência de tipos:** `ResultadoCorrecao` (Fase 1 Task 3) é o retorno de P2-7/P2-9/P2-11; `MotorGs`/`SaidaMotor` (P2-3) consumidos por P2-4/P2-7; `EstadoLinha` (Fase 1 Task 15) é o `estadoDestino` de P2-9 e as ações de store em P2-10; `Ocorrencia` idêntico em todo o caminho.

---

## Execução

Só após a Fase 1 em produção. Ordem: **P2-0 (aprovar) → P2-1 (aprovar)** → P2-2 → P2-3 → P2-4 → P2-5 → P2-6 → P2-7 → P2-8 → P2-9 → P2-10 → P2-11 → P2-12 → P2-13 → P2-14. Usar `superpowers:subagent-driven-development`, revisão entre tasks, `verification-before-completion` em cada uma.
