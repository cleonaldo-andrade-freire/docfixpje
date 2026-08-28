# Validador PJe — Fase 1 (Validação) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a ferramenta web pública que recebe arquivos por upload, valida PDF/MP3/MP4 no navegador (tipo por magic number, assinatura digital, tamanho, conformidade PDF/A declarada + estrutural), mostra diagnóstico verde/vermelho por arquivo com orientação textual de correção manual, e descarta tudo sem deixar rastro persistente — sem nenhum WASM.

**Architecture:** SPA React + TypeScript + Vite, sem back-end. Validadores são funções puras `(ContextoArquivo) => Ocorrencia[]` registradas num array e totalmente desacopladas da UI. A análise de cada arquivo roda num Web Worker dedicado, criado e terminado por arquivo (libera heap por construção). A UI mantém apenas objetos `File` (referência preguiçosa), nunca `ArrayBuffer`. Estado da linha é uma máquina de estados explícita com transições declaradas. Estilo em CSS Modules (CSP proíbe CSS-in-JS em runtime). Distribuição estática com cabeçalhos de segurança versionados no repo.

**Tech Stack:** Vite, React 18, TypeScript (strict), Vitest + @testing-library/react + jsdom, @vitest/web-worker, pdf-lib (análise estrutural de PDF), Playwright (E2E + evidências), pdfjs-dist (devDependency de teste, Fase 2). Sem CDN, sem fontes remotas, sem CSS-in-JS runtime.

**Spec:** `docs/spec/2026-08-28-validador-pje-especificacao.md` (o plano argumenta a partir dela; executores leem os dois).

## Global Constraints

- **Privacidade absoluta.** Nenhum byte de arquivo, nome de arquivo ou metadado de documento pode sair do navegador nem tocar `localStorage`, `sessionStorage`, IndexedDB, Cache API, cookie, `document.title`, `history` ou URL. Nenhuma chamada de rede em runtime para host externo. (spec §9.1, §11)
- **Nenhum limite numérico literal fora de `src/config/limites.ts`.** (spec §1.6, §7.2)
- **TDD red/green obrigatório.** Os itens da spec §14 são os testes a escrever primeiro. Nunca relaxar asserção nem ajustar fixture para passar. (spec §1.1)
- **Fixtures só sintéticas**, geradas por `scripts/gerar-fixtures.ts`, com dados fictícios e certificado autoassinado gerado no script. Nenhum arquivo com dado pessoal no repo, mesmo em `.gitignore`. Nada além de dados fictícios em screenshots/gravações. (spec §1.5)
- **Validadores desacoplados da UI**: assinatura `(ArrayBuffer, metadados, config) => Ocorrencia[]`, registrados em array. (spec §15)
- **TypeScript strict.** `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` ligados.
- **Dependências mínimas e pinadas.** `.npmrc` com `save-exact=true`. Lockfile commitado. Toda nova dependência é justificada no commit. (spec §10.3)
- **Sem CSS-in-JS runtime.** CSS Modules ou CSS plano apenas. (spec §16.3)
- **Processamento sequencial**, um worker por vez. (spec §5, §10.2)
- **Estados da linha e transições** conforme tabela da spec §6; transição inválida lança erro em desenvolvimento. (spec §14.2)
- **Textos das mensagens de etapa e dos estados** copiados literalmente da spec §6.

---

## File Structure

```
.
├── .npmrc                              # save-exact=true
├── .gitignore                          # inclui /fixtures/gerados, /docs/evidencias/*.png etc? não: evidências versionadas
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts                      # + middleware dev que espelha os headers de _headers
├── vitest.config.ts
├── playwright.config.ts
├── public/
│   └── _headers                        # Cloudflare Pages: CSP, HSTS, etc (spec §10)
├── .agents/
│   └── rules/
│       ├── privacidade.md
│       ├── dominio-pje.md
│       ├── limites-config.md
│       └── correcao-honesta.md
├── scripts/
│   └── gerar-fixtures.ts               # gera todos os PDFs/MP3/MP4 sintéticos
├── fixtures/                           # SAÍDA do script; gitignored
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── config/
│   │   └── limites.ts                  # ÚNICA fonte de números
│   ├── tipos.ts                        # contrato de saída (spec §12) + unions de códigos
│   ├── deteccao/
│   │   └── detectarTipo.ts             # magic number
│   ├── pdf/
│   │   ├── estrutura.ts                # carregar via pdf-lib + varredura bruta do trailer
│   │   └── xmp.ts                      # extrair packet + ler pdfaid
│   ├── validadores/
│   │   ├── contexto.ts                 # tipo ContextoArquivo + montarContexto()
│   │   ├── assinatura.ts               # Regra 1
│   │   ├── tamanho.ts                  # Regra 2
│   │   ├── pdfaDeclaracao.ts           # Regra 3 nível 1
│   │   ├── pdfaEstrutura.ts            # Regra 3 nível 2
│   │   ├── registro.ts                 # array de validadores por tipo
│   │   └── validarArquivo.ts           # orquestrador -> ResultadoValidacao
│   ├── orientacao/
│   │   └── manual.ts                   # texto de correção manual + fluxo encadeado §7.4
│   ├── estado/
│   │   ├── maquinaLinha.ts             # estados + transições declaradas
│   │   └── store.ts                    # useReducer + Context (lista de File, estado por linha)
│   ├── workers/
│   │   ├── validacao.worker.ts         # entrypoint do worker
│   │   └── protocolo.ts                # tipos de mensagem worker<->main
│   ├── execucao/
│   │   └── orquestrador.ts             # 1 worker/arquivo, sequencial, terminate no finally
│   ├── infra/
│   │   ├── blobRegistry.ts             # §9.4
│   │   └── ociosidade.ts               # timer 30 min §9.5
│   ├── ui/
│   │   ├── AreaUpload.tsx
│   │   ├── ListaArquivos.tsx
│   │   ├── LinhaArquivo.tsx
│   │   ├── EstadoLinha.tsx             # ícone-por-forma + rótulo + cor + aria-live
│   │   ├── BotaoValidar.tsx
│   │   ├── Diagnostico.tsx
│   │   ├── ControlesDescarte.tsx
│   │   ├── AvisoPrivacidade.tsx
│   │   └── icones.tsx                  # SVG inline: CirculoCheck, TrianguloExclamacao, Spinner
│   ├── estilos/
│   │   ├── tokens.css                  # custom properties claro/escuro
│   │   └── global.css
│   └── sw.ts                           # service worker: cache allowlist por caminho
├── tests/
│   ├── bundle/semRedeExterna.test.ts
│   ├── headers/headersConfig.test.ts
│   └── e2e/
│       ├── fluxo.spec.ts
│       ├── descarte.spec.ts
│       └── evidencias.spec.ts          # gera screenshots/gravação em docs/evidencias
└── docs/
    ├── spec/2026-08-28-validador-pje-especificacao.md
    ├── superpowers/plans/…
    └── evidencias/                     # screenshots + gravação (fixtures sintéticas)
```

---

## Task 1: Scaffold do projeto e ferramentas

**Files:**
- Create: `package.json`, `.npmrc`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.gitignore`, `.agents/rules/*.md`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: app React montável; `npm test`, `npm run build`, `npm run dev` funcionando.

- [ ] **Step 1: Escrever o teste de fumaça**

```tsx
// src/App.test.tsx
import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renderiza o título da ferramenta', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', { name: /validador de arquivos para o pje/i }),
  ).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npm test -- src/App.test.tsx`
Expected: FAIL — módulo `./App` não existe.

- [ ] **Step 3: Criar configuração e scaffold mínimo**

`.npmrc`:
```
save-exact=true
```

`package.json` (scripts e deps pinadas — versões exatas resolvidas na instalação):
```json
{
  "name": "validador-pje",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint . && tsc -b --noEmit"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "pdf-lib": "1.17.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.4.8",
    "@testing-library/react": "16.0.1",
    "@testing-library/user-event": "14.5.2",
    "@types/react": "18.3.5",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.1",
    "@vitest/web-worker": "2.0.5",
    "jsdom": "25.0.0",
    "typescript": "5.5.4",
    "vite": "5.4.2",
    "vitest": "2.0.5",
    "jest-axe": "9.0.0",
    "@playwright/test": "1.46.1"
  }
}
```

`tsconfig.json` — `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `verbatimModuleSyntax: true`, `jsx: "react-jsx"`, `lib: ["ES2022","DOM","DOM.Iterable","WebWorker"]`.

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    globals: true,
  },
});
```

`src/setupTests.ts`: `import '@testing-library/jest-dom/vitest';`

`src/App.tsx`:
```tsx
export function App() {
  return (
    <main>
      <h1>Validador de arquivos para o PJe</h1>
    </main>
  );
}
```

`src/main.tsx` monta `<App/>` em `#root`. `index.html` com `<div id="root">` e `<html lang="pt-BR">`.

`.gitignore`: `node_modules`, `dist`, `fixtures/`, `coverage`, `test-results`, `playwright-report`, `.DS_Store`.

- [ ] **Step 4: Criar as rules do workspace**

`.agents/rules/privacidade.md`, `dominio-pje.md`, `limites-config.md`, `correcao-honesta.md` com o texto literal da spec §1.6.

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `npm test -- src/App.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verificar build**

Run: `npm run build`
Expected: build conclui sem erro; `dist/` gerado.

- [ ] **Step 7: Commit**

```bash
git init && git add -A
git commit -m "chore: scaffold Vite+React+TS+Vitest e rules do workspace"
```

---

## Task 2: `src/config/limites.ts` — fonte única de constantes

**Files:**
- Create: `src/config/limites.ts`
- Test: `src/config/limites.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const LIMITES: {
    TAMANHO_MAX_BYTES: number;            // 10 * 1024 * 1024
    TAMANHO_ABSOLUTO_LEITURA_BYTES: number; // acima disso, rejeita sem ler
    MAX_ARQUIVOS_LOTE: number;            // 20
    OCIOSIDADE_MS: number;               // 30 * 60 * 1000
    REVOGACAO_BLOB_DELAY_MS: number;     // 30 * 1000
    TIMEOUT_CORRECAO_PDF_MS: number;     // 120_000 (usado na Fase 2)
  };
  export const PDFA: {
    pdfaObrigatorio: boolean;            // true
    pdfaGravidade: 'erro' | 'aviso';     // 'aviso' (padrão de fábrica)
    pdfaPartesAceitas: number[];         // [1, 2, 3, 4]
  };
  ```

- [ ] **Step 1: Escrever o teste**

```ts
// src/config/limites.test.ts
import { LIMITES, PDFA } from './limites';

test('limite de tamanho é exatamente 10 * 1024 * 1024', () => {
  expect(LIMITES.TAMANHO_MAX_BYTES).toBe(10_485_760);
});

test('máximo de arquivos por lote é 20', () => {
  expect(LIMITES.MAX_ARQUIVOS_LOTE).toBe(20);
});

test('ociosidade é 30 minutos em ms', () => {
  expect(LIMITES.OCIOSIDADE_MS).toBe(30 * 60 * 1000);
});

test('PDF/A: padrão de fábrica é aviso e partes 1..4', () => {
  expect(PDFA.pdfaGravidade).toBe('aviso');
  expect(PDFA.pdfaPartesAceitas).toEqual([1, 2, 3, 4]);
  expect(PDFA.pdfaObrigatorio).toBe(true);
});

test('tamanho absoluto de leitura é maior que o limite e finito', () => {
  expect(LIMITES.TAMANHO_ABSOLUTO_LEITURA_BYTES).toBeGreaterThan(LIMITES.TAMANHO_MAX_BYTES);
  expect(Number.isFinite(LIMITES.TAMANHO_ABSOLUTO_LEITURA_BYTES)).toBe(true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- src/config/limites.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// src/config/limites.ts
export const LIMITES = {
  TAMANHO_MAX_BYTES: 10 * 1024 * 1024,
  TAMANHO_ABSOLUTO_LEITURA_BYTES: 100 * 1024 * 1024,
  MAX_ARQUIVOS_LOTE: 20,
  OCIOSIDADE_MS: 30 * 60 * 1000,
  REVOGACAO_BLOB_DELAY_MS: 30 * 1000,
  TIMEOUT_CORRECAO_PDF_MS: 120_000,
} as const;

export const PDFA = {
  pdfaObrigatorio: true,
  pdfaGravidade: 'aviso' as 'erro' | 'aviso',
  pdfaPartesAceitas: [1, 2, 3, 4],
} as const;
```

- [ ] **Step 4: Rodar e ver passar** — `npm test -- src/config/limites.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/limites.ts src/config/limites.test.ts
git commit -m "feat: constantes de limite em fonte única (spec §7.2, §10.2)"
```

---

## Task 3: `src/tipos.ts` — contrato de saída e unions de códigos

**Files:**
- Create: `src/tipos.ts`
- Test: `src/tipos.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type TipoDetectado = 'application/pdf' | 'audio/mpeg' | 'video/mp4';
  export type Gravidade = 'erro' | 'aviso';

  export type CodigoOcorrencia =
    | 'ASSINATURA_PRESENTE' | 'CAMPO_ASSINATURA_VAZIO' | 'RESTRICAO_DOCMDP'
    | 'TAMANHO_EXCEDIDO' | 'FORMATO_NAO_SUPORTADO' | 'ARQUIVO_CRIPTOGRAFADO'
    | 'ARQUIVO_CORROMPIDO' | 'PDFA_NAO_DECLARADO' | 'PDFA_DECLARACAO_INCONSISTENTE'
    | 'PDFA_CRIPTOGRAFADO' | 'PDFA_SEM_OUTPUTINTENT' | 'PDFA_FONTE_NAO_EMBUTIDA'
    | 'PDFA_JAVASCRIPT' | 'PDFA_ARQUIVO_EMBUTIDO' | 'PDFA_TRANSPARENCIA'
    | 'PDFA_REFERENCIA_EXTERNA';

  export type EstrategiaCorrecao =
    | 'REMOVER_ASSINATURA' | 'CONVERTER_PDFA' | 'COMPRIMIR_PDF' | 'RECODIFICAR_MIDIA';

  export interface Ocorrencia {
    codigo: CodigoOcorrencia;
    gravidade: Gravidade;
    mensagem: string;
    detalheTecnico: string;
    orientacao: string;
    correcaoDisponivel: EstrategiaCorrecao | null;
  }

  export interface ResultadoValidacao {
    nomeArquivo: string;
    tipoDetectado: TipoDetectado | null;
    tamanhoBytes: number;
    pdfaParte: number | null;
    pdfaConformidade: 'A' | 'B' | 'U' | null;
    apto: boolean;
    corrigivel: boolean;
    ocorrencias: Ocorrencia[];
    correcao?: ResultadoCorrecao;   // preenchido só na Fase 2
  }

  export interface ResultadoCorrecao {
    tentada: boolean;
    estrategias: EstrategiaCorrecao[];
    sucesso: boolean;
    tamanhoAntes: number;
    tamanhoDepois: number;
    textoPreservado: boolean;
    avisos: string[];
    duracaoMs: number;
    revalidacao: { apto: boolean; ocorrencias: Ocorrencia[] };
  }

  export const CODIGOS_OCORRENCIA: readonly CodigoOcorrencia[];
  export const ESTRATEGIAS_CORRECAO: readonly EstrategiaCorrecao[];
  ```

- [ ] **Step 1: Escrever o teste**

```ts
// src/tipos.test.ts
import { CODIGOS_OCORRENCIA, ESTRATEGIAS_CORRECAO } from './tipos';

test('lista de códigos de ocorrência bate com a spec §12 (16 códigos)', () => {
  expect(new Set(CODIGOS_OCORRENCIA)).toEqual(new Set([
    'ASSINATURA_PRESENTE', 'CAMPO_ASSINATURA_VAZIO', 'RESTRICAO_DOCMDP',
    'TAMANHO_EXCEDIDO', 'FORMATO_NAO_SUPORTADO', 'ARQUIVO_CRIPTOGRAFADO',
    'ARQUIVO_CORROMPIDO', 'PDFA_NAO_DECLARADO', 'PDFA_DECLARACAO_INCONSISTENTE',
    'PDFA_CRIPTOGRAFADO', 'PDFA_SEM_OUTPUTINTENT', 'PDFA_FONTE_NAO_EMBUTIDA',
    'PDFA_JAVASCRIPT', 'PDFA_ARQUIVO_EMBUTIDO', 'PDFA_TRANSPARENCIA',
    'PDFA_REFERENCIA_EXTERNA',
  ]));
  expect(CODIGOS_OCORRENCIA).toHaveLength(16);
});

test('estratégias de correção batem com a spec §12', () => {
  expect(new Set(ESTRATEGIAS_CORRECAO)).toEqual(new Set([
    'REMOVER_ASSINATURA', 'CONVERTER_PDFA', 'COMPRIMIR_PDF', 'RECODIFICAR_MIDIA',
  ]));
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `src/tipos.ts`** com as interfaces do bloco Interfaces e:

```ts
export const CODIGOS_OCORRENCIA = [
  'ASSINATURA_PRESENTE', 'CAMPO_ASSINATURA_VAZIO', 'RESTRICAO_DOCMDP',
  'TAMANHO_EXCEDIDO', 'FORMATO_NAO_SUPORTADO', 'ARQUIVO_CRIPTOGRAFADO',
  'ARQUIVO_CORROMPIDO', 'PDFA_NAO_DECLARADO', 'PDFA_DECLARACAO_INCONSISTENTE',
  'PDFA_CRIPTOGRAFADO', 'PDFA_SEM_OUTPUTINTENT', 'PDFA_FONTE_NAO_EMBUTIDA',
  'PDFA_JAVASCRIPT', 'PDFA_ARQUIVO_EMBUTIDO', 'PDFA_TRANSPARENCIA',
  'PDFA_REFERENCIA_EXTERNA',
] as const satisfies readonly CodigoOcorrencia[];

export const ESTRATEGIAS_CORRECAO = [
  'REMOVER_ASSINATURA', 'CONVERTER_PDFA', 'COMPRIMIR_PDF', 'RECODIFICAR_MIDIA',
] as const satisfies readonly EstrategiaCorrecao[];
```

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "feat: tipos do contrato de saída (spec §12)"`

---

## Task 4: Detecção de tipo por magic number

**Files:**
- Create: `src/deteccao/detectarTipo.ts`
- Test: `src/deteccao/detectarTipo.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `export function detectarTipo(bytes: Uint8Array): TipoDetectado | null`

- [ ] **Step 1: Escrever o teste** (usa buffers construídos à mão, sem fixtures em disco)

```ts
// src/deteccao/detectarTipo.test.ts
import { detectarTipo } from './detectarTipo';

const b = (...arr: number[]) => new Uint8Array(arr);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
function concat(...parts: Uint8Array[]) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

test('PDF: %PDF- no início', () => {
  expect(detectarTipo(ascii('%PDF-1.7\n%âãÏÓ'))).toBe('application/pdf');
});

test('PDF: %PDF- após BOM/prefixo curto', () => {
  expect(detectarTipo(concat(b(0xEF, 0xBB, 0xBF), ascii('%PDF-1.4')))).toBe('application/pdf');
});

test('MP3: tag ID3', () => {
  expect(detectarTipo(concat(ascii('ID3'), b(0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x21)))).toBe('audio/mpeg');
});

test('MP3: frame sync 0xFFFB', () => {
  expect(detectarTipo(b(0xFF, 0xFB, 0x90, 0x64, 0x00))).toBe('audio/mpeg');
});

test('MP4: ftyp com brand isom', () => {
  const buf = concat(b(0x00, 0x00, 0x00, 0x18), ascii('ftypisom'), b(0, 0, 0, 0), ascii('isommp41'));
  expect(detectarTipo(buf)).toBe('video/mp4');
});

test('MP4: brand qt (MOV) não é aceito', () => {
  const buf = concat(b(0x00, 0x00, 0x00, 0x18), ascii('ftypqt  '), b(0, 0, 0, 0));
  expect(detectarTipo(buf)).toBeNull();
});

test('executável renomeado (MZ) -> null', () => {
  expect(detectarTipo(b(0x4D, 0x5A, 0x90, 0x00))).toBeNull();
});

test('vazio -> null', () => {
  expect(detectarTipo(new Uint8Array())).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

```ts
// src/deteccao/detectarTipo.ts
import type { TipoDetectado } from '../tipos';

const BRANDS_MP4_ACEITAS = new Set(['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'dash']);

function acha(bytes: Uint8Array, alvo: number[], ateOffset: number): boolean {
  const limite = Math.min(ateOffset, bytes.length - alvo.length);
  for (let i = 0; i <= limite; i++) {
    let ok = true;
    for (let j = 0; j < alvo.length; j++) {
      if (bytes[i + j] !== alvo[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function texto(bytes: Uint8Array, offset: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[offset + i] ?? 0);
  return s;
}

function ehPdf(bytes: Uint8Array): boolean {
  return acha(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d], 1024); // "%PDF-"
}

function ehMp3(bytes: Uint8Array): boolean {
  if (texto(bytes, 0, 3) === 'ID3') return true;
  for (let i = 0; i < Math.min(bytes.length - 1, 4096); i++) {
    if (bytes[i] === 0xff) {
      const b1 = bytes[i + 1] ?? 0;
      const ehSync = (b1 & 0xe0) === 0xe0;           // 3 bits altos ligados
      const layerBitrateValido = (b1 & 0x06) !== 0 && ((bytes[i + 2] ?? 0xf0) >> 4) !== 0x0f;
      if (ehSync && layerBitrateValido) return true;
    }
  }
  return false;
}

function ehMp4(bytes: Uint8Array): boolean {
  if (texto(bytes, 4, 4) !== 'ftyp') return false;
  const major = texto(bytes, 8, 4).trim().toLowerCase();
  if (BRANDS_MP4_ACEITAS.has(major)) return true;
  // conferir compatible brands a partir do offset 16, dentro do box
  const tamBox = Math.min(
    ((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0),
    bytes.length,
  );
  for (let o = 16; o + 4 <= tamBox; o += 4) {
    if (BRANDS_MP4_ACEITAS.has(texto(bytes, o, 4).trim().toLowerCase())) return true;
  }
  return false;
}

export function detectarTipo(bytes: Uint8Array): TipoDetectado | null {
  if (bytes.length < 4) return null;
  if (ehPdf(bytes)) return 'application/pdf';
  if (ehMp4(bytes)) return 'video/mp4';
  if (ehMp3(bytes)) return 'audio/mpeg';
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "feat: detecção de tipo por magic number (spec §4, §16.6)"`

---

## Task 5: `src/pdf/estrutura.ts` — carregar PDF e varredura bruta do trailer

**Files:**
- Create: `src/pdf/estrutura.ts`
- Test: `src/pdf/estrutura.test.ts`

**Interfaces:**
- Consumes: `pdf-lib`.
- Produces:
  ```ts
  export type CargaPdf =
    | { ok: true; doc: import('pdf-lib').PDFDocument }
    | { ok: false; motivo: 'ARQUIVO_CRIPTOGRAFADO' | 'ARQUIVO_CORROMPIDO' };
  export function carregarPdf(bytes: Uint8Array): Promise<CargaPdf>;

  export interface TrailerBruto {
    temEncrypt: boolean;
    temByteRangeEContents: boolean;
    temPerms: boolean;
    temDocMDP: boolean;
    temUR3: boolean;
    temAcroForm: boolean;
    sigFlags: number | null;      // valor de /SigFlags se presente
    nomesCamposSig: string[];     // nomes de campos /FT /Sig achados por varredura bruta
    camposSigComV: number;        // quantos têm /V (preenchidos)
  }
  export function varrerTrailerBruto(bytes: Uint8Array): TrailerBruto;
  ```
- Nota de projeto: `pdf-lib` nem sempre expõe `SigFlags` e não vê assinaturas em *incremental updates*. Por isso a varredura bruta por regex de bytes é a fonte primária da Regra 1; `pdf-lib` complementa com nomes de campos quando conseguir carregar.

- [ ] **Step 1: Escrever o teste** (fixtures geradas — depende da Task 30; para destravar, usar `scripts/gerar-fixtures.ts` mínimo ou construir PDFs no próprio teste com `pdf-lib`).

```ts
// src/pdf/estrutura.test.ts
import { readFile } from 'node:fs/promises';
import { carregarPdf, varrerTrailerBruto } from './estrutura';

const ler = (n: string) => readFile(new URL(`../../fixtures/${n}`, import.meta.url));

test('PDF simples carrega ok', async () => {
  const r = await carregarPdf(new Uint8Array(await ler('simples.pdf')));
  expect(r.ok).toBe(true);
});

test('PDF com senha -> ARQUIVO_CRIPTOGRAFADO', async () => {
  const r = await carregarPdf(new Uint8Array(await ler('criptografado.pdf')));
  expect(r).toEqual({ ok: false, motivo: 'ARQUIVO_CRIPTOGRAFADO' });
});

test('bytes lixo -> ARQUIVO_CORROMPIDO', async () => {
  const r = await carregarPdf(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]));
  expect(r).toEqual({ ok: false, motivo: 'ARQUIVO_CORROMPIDO' });
});

test('varredura bruta acha assinatura em PDF assinado', async () => {
  const t = varrerTrailerBruto(new Uint8Array(await ler('assinado.pdf')));
  expect(t.temByteRangeEContents).toBe(true);
  expect(t.sigFlags).not.toBe(0);
  expect(t.nomesCamposSig.length).toBeGreaterThanOrEqual(1);
});

test('varredura bruta em PDF limpo não acha nada', async () => {
  const t = varrerTrailerBruto(new Uint8Array(await ler('simples.pdf')));
  expect(t.temByteRangeEContents).toBe(false);
  expect(t.temEncrypt).toBe(false);
  expect(t.nomesCamposSig).toEqual([]);
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

```ts
// src/pdf/estrutura.ts
import { PDFDocument, EncryptedPDFError } from 'pdf-lib';

export type CargaPdf =
  | { ok: true; doc: PDFDocument }
  | { ok: false; motivo: 'ARQUIVO_CRIPTOGRAFADO' | 'ARQUIVO_CORROMPIDO' };

export async function carregarPdf(bytes: Uint8Array): Promise<CargaPdf> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return { ok: true, doc };
  } catch (e) {
    if (e instanceof EncryptedPDFError) return { ok: false, motivo: 'ARQUIVO_CRIPTOGRAFADO' };
    return { ok: false, motivo: 'ARQUIVO_CORROMPIDO' };
  }
}

export interface TrailerBruto {
  temEncrypt: boolean;
  temByteRangeEContents: boolean;
  temPerms: boolean;
  temDocMDP: boolean;
  temUR3: boolean;
  temAcroForm: boolean;
  sigFlags: number | null;
  nomesCamposSig: string[];
  camposSigComV: number;
}

export function varrerTrailerBruto(bytes: Uint8Array): TrailerBruto {
  // Latin-1: cada byte -> 1 code unit; seguro para varrer sintaxe PDF.
  const s = Array.from(bytes, (b) => String.fromCharCode(b)).join('');

  const sigFlagsMatch = s.match(/\/SigFlags\s+(\d+)/);
  const sigFlags = sigFlagsMatch ? Number(sigFlagsMatch[1]) : null;

  const temByteRange = /\/ByteRange\s*\[/.test(s);
  const temContents = /\/Contents\s*<[0-9A-Fa-f\s]+>/.test(s);

  // campos /FT /Sig — capturar /T (nome) próximo e presença de /V no mesmo dicionário
  const nomes: string[] = [];
  let comV = 0;
  const re = /\/FT\s*\/Sig\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const janela = s.slice(Math.max(0, m.index - 400), m.index + 400);
    const nome = janela.match(/\/T\s*\(([^)]*)\)/);
    nomes.push(nome ? nome[1]! : `campo_${nomes.length + 1}`);
    if (/\/V\s+\d+\s+\d+\s+R/.test(janela) || /\/V\s*<</.test(janela)) comV++;
  }

  return {
    temEncrypt: /\/Encrypt\b/.test(s),
    temByteRangeEContents: temByteRange && temContents,
    temPerms: /\/Perms\b/.test(s),
    temDocMDP: /\/DocMDP\b/.test(s),
    temUR3: /\/UR3\b/.test(s),
    temAcroForm: /\/AcroForm\b/.test(s),
    sigFlags,
    nomesCamposSig: nomes,
    camposSigComV: comV,
  };
}
```

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "feat: carga de PDF e varredura bruta do trailer (spec §7.1, §16.4)"`

---

## Task 6: `src/pdf/xmp.ts` — extrair packet XMP e ler `pdfaid`

**Files:**
- Create: `src/pdf/xmp.ts`
- Test: `src/pdf/xmp.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function extrairXmp(bytes: Uint8Array): string | null;
  export function lerPdfaId(xmp: string): { parte: number; conformidade: 'A' | 'B' | 'U' } | null;
  ```
- Nota: `DOMParser` existe no jsdom (testes) e no worker via `self.DOMParser`? Não — Web Workers **não** têm `DOMParser`. Portanto `lerPdfaId` usa parsing por regex tolerante, sem `DOMParser`, para poder rodar dentro do worker. O namespace alvo é `http://www.aiim.org/pdfa/ns/id/`; aceitar tanto atributo (`pdfaid:part="1"`) quanto elemento (`<pdfaid:part>1</pdfaid:part>`), e qualquer prefixo mapeado para o namespace.

- [ ] **Step 1: Escrever o teste**

```ts
// src/pdf/xmp.test.ts
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
  expect(extrairXmp(dentro)).toContain('pdfaid:part');
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
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

```ts
// src/pdf/xmp.ts
export function extrairXmp(bytes: Uint8Array): string | null {
  const s = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  const ini = s.indexOf('<?xpacket begin');
  if (ini === -1) return null;
  const fimMarca = s.indexOf('<?xpacket end', ini);
  const fim = fimMarca === -1 ? s.length : s.indexOf('?>', fimMarca) + 2;
  return s.slice(ini, fim);
}

const NS_PDFAID = 'http://www.aiim.org/pdfa/ns/id/';

export function lerPdfaId(
  xmp: string,
): { parte: number; conformidade: 'A' | 'B' | 'U' } | null {
  // descobrir quais prefixos apontam para o namespace pdfaid
  const prefixos = new Set<string>();
  const reNs = /xmlns:([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = reNs.exec(xmp)) !== null) {
    if (m[2] === NS_PDFAID) prefixos.add(m[1]!);
  }
  if (prefixos.size === 0) return null;

  const alt = [...prefixos].map((p) => p.replace(/[-]/g, '\\-')).join('|');
  const achar = (campo: 'part' | 'conformance'): string | null => {
    const attr = new RegExp(`(?:${alt}):${campo}\\s*=\\s*"([^"]+)"`);
    const elem = new RegExp(`<(?:${alt}):${campo}\\s*>\\s*([^<\\s]+)\\s*</(?:${alt}):${campo}>`);
    const a = xmp.match(attr) ?? xmp.match(elem);
    return a ? a[1]! : null;
  };

  const parteStr = achar('part');
  const confStr = achar('conformance');
  if (parteStr === null && confStr === null) return null;

  const parte = Number(parteStr);
  const conformidade = (confStr ?? '').toUpperCase();
  if (![1, 2, 3, 4].includes(parte)) return null;
  if (!['A', 'B', 'U'].includes(conformidade)) return null;
  return { parte, conformidade: conformidade as 'A' | 'B' | 'U' };
}
```

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "feat: extração de XMP e leitura de pdfaid sem DOMParser (spec §7.3, §16.5)"`

---

## Task 7: `src/validadores/contexto.ts` — contexto compartilhado dos validadores

**Files:**
- Create: `src/validadores/contexto.ts`
- Test: `src/validadores/contexto.test.ts`

**Interfaces:**
- Consumes: `carregarPdf`, `varrerTrailerBruto` (Task 5); `extrairXmp`, `lerPdfaId` (Task 6); `PDFA` (Task 2).
- Produces:
  ```ts
  export interface ContextoArquivo {
    nomeArquivo: string;
    bytes: Uint8Array;
    tamanhoBytes: number;
    tipo: TipoDetectado | null;
    pdf: {
      carga: CargaPdf;
      trailer: TrailerBruto;
      pdfaId: { parte: number; conformidade: 'A' | 'B' | 'U' } | null;
    } | null;                                  // null quando não é PDF
    config: { pdfa: typeof PDFA };
  }
  export function montarContexto(
    nomeArquivo: string, bytes: Uint8Array, tipo: TipoDetectado | null,
    config?: { pdfa: typeof PDFA },
  ): Promise<ContextoArquivo>;
  ```

- [ ] **Step 1: Escrever o teste** — para PDF simples: `contexto.pdf` não-nulo, `pdfaId` null; para PDF/A-1b: `pdfaId` `{parte:1, conformidade:'B'}`; para MP3: `contexto.pdf` é `null`; `config` default vem de `PDFA`.

```ts
// src/validadores/contexto.test.ts
import { readFile } from 'node:fs/promises';
import { montarContexto } from './contexto';
const ler = (n: string) => readFile(new URL(`../../fixtures/${n}`, import.meta.url));

test('PDF simples: pdf presente, pdfaId null', async () => {
  const ctx = await montarContexto('s.pdf', new Uint8Array(await ler('simples.pdf')), 'application/pdf');
  expect(ctx.pdf).not.toBeNull();
  expect(ctx.pdf!.pdfaId).toBeNull();
});

test('PDF/A-1b: pdfaId preenchido', async () => {
  const ctx = await montarContexto('a.pdf', new Uint8Array(await ler('pdfa-1b.pdf')), 'application/pdf');
  expect(ctx.pdf!.pdfaId).toEqual({ parte: 1, conformidade: 'B' });
});

test('MP3: sem bloco pdf', async () => {
  const ctx = await montarContexto('a.mp3', new Uint8Array(await ler('audio.mp3')), 'audio/mpeg');
  expect(ctx.pdf).toBeNull();
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** `montarContexto`: se `tipo === 'application/pdf'`, chamar `carregarPdf`, `varrerTrailerBruto`, `extrairXmp`+`lerPdfaId`; senão `pdf: null`. `config` default `{ pdfa: PDFA }`.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "feat: contexto compartilhado dos validadores"`

---

## Task 8: Regra 1 — validador de assinatura digital

**Files:**
- Create: `src/validadores/assinatura.ts`
- Test: `src/validadores/assinatura.test.ts`

**Interfaces:**
- Consumes: `ContextoArquivo` (Task 7).
- Produces: `export function validarAssinatura(ctx: ContextoArquivo): Ocorrencia[]`

**Regras (spec §7.1):** reprova (`erro`, código `ASSINATURA_PRESENTE`) se qualquer:
`AcroForm` presente e `SigFlags` ≠ 0/null; existe campo `/FT /Sig` com `/V`; existe `/ByteRange`+`/Contents`; `/Perms` com `/DocMDP` ou `/UR3` (este emite também `RESTRICAO_DOCMDP`, `erro`). Campo `/FT /Sig` **sem** `/V` → `CAMPO_ASSINATURA_VAZIO` (`aviso`). `detalheTecnico` traz `SigFlags`, contagem e nomes dos campos. MP3/MP4 (`ctx.pdf === null`) → `[]`.

- [ ] **Step 1: Escrever os testes** (cobre 14.1: assinado → `ASSINATURA_PRESENTE`; campo vazio → aviso `CAMPO_ASSINATURA_VAZIO`; simples → `[]`; MP3 → `[]`; PDF com `/Perms /DocMDP` → `ASSINATURA_PRESENTE` + `RESTRICAO_DOCMDP`).

```ts
// src/validadores/assinatura.test.ts
import { readFile } from 'node:fs/promises';
import { montarContexto } from './contexto';
import { validarAssinatura } from './assinatura';
const ctxDe = async (n: string, tipo: any) =>
  montarContexto(n, new Uint8Array(await readFile(new URL(`../../fixtures/${n}`, import.meta.url))), tipo);

test('PDF assinado -> ASSINATURA_PRESENTE erro com nome do campo', async () => {
  const oc = validarAssinatura(await ctxDe('assinado.pdf', 'application/pdf'));
  const a = oc.find((o) => o.codigo === 'ASSINATURA_PRESENTE');
  expect(a?.gravidade).toBe('erro');
  expect(a?.detalheTecnico).toMatch(/Signature1|campo_/);
  expect(a?.correcaoDisponivel).toBe('REMOVER_ASSINATURA');
});

test('campo de assinatura vazio -> aviso, sem erro', async () => {
  const oc = validarAssinatura(await ctxDe('campo-sig-vazio.pdf', 'application/pdf'));
  expect(oc.map((o) => o.codigo)).toEqual(['CAMPO_ASSINATURA_VAZIO']);
  expect(oc[0]!.gravidade).toBe('aviso');
});

test('PDF simples -> nenhuma ocorrência', async () => {
  expect(validarAssinatura(await ctxDe('simples.pdf', 'application/pdf'))).toEqual([]);
});

test('MP3 -> nenhuma ocorrência (regra não se aplica)', async () => {
  expect(validarAssinatura(await ctxDe('audio.mp3', 'audio/mpeg'))).toEqual([]);
});

test('PDF com /Perms /DocMDP -> ASSINATURA_PRESENTE + RESTRICAO_DOCMDP', async () => {
  const cod = validarAssinatura(await ctxDe('docmdp.pdf', 'application/pdf')).map((o) => o.codigo);
  expect(cod).toContain('ASSINATURA_PRESENTE');
  expect(cod).toContain('RESTRICAO_DOCMDP');
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** com base em `ctx.pdf.trailer`. Coletar ocorrências; montar `mensagem` ("O documento contém N assinatura(s) digital(is)."), `orientacao` ("Podemos remover a assinatura automaticamente." — Fase 1 exibe como orientação textual; `correcaoDisponivel: 'REMOVER_ASSINATURA'`).

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "feat: Regra 1 — validador de assinatura digital (spec §7.1)"`

---

## Task 9: Regra 2 — validador de tamanho

**Files:**
- Create: `src/validadores/tamanho.ts`
- Test: `src/validadores/tamanho.test.ts`

**Interfaces:**
- Consumes: `ContextoArquivo`, `LIMITES` (Task 2).
- Produces: `export function validarTamanho(ctx: ContextoArquivo): Ocorrencia[]`

**Regra:** `ctx.tamanhoBytes > LIMITES.TAMANHO_MAX_BYTES` → `TAMANHO_EXCEDIDO` (`erro`), `detalheTecnico` com tamanho real e excedente, `correcaoDisponivel`: `COMPRIMIR_PDF` se PDF, `RECODIFICAR_MIDIA` se MP3/MP4. Aplica a todos os tipos.

- [ ] **Step 1: Escrever os testes** (14.1: 10_485_760 passa; 10_485_761 reprova; MP4 50 MB reprova só por tamanho — testar via `ctx.tamanhoBytes` forçado, sem fixture de 50 MB real: construir contexto com `bytes` pequeno mas passar `tamanhoBytes` explícito? `montarContexto` deriva de `bytes.length`. Então adicionar fixture `grande-10485761.pdf` exata e, para 50 MB, um teste unitário que chama `validarTamanho` com um `ContextoArquivo` montado à mão).

```ts
import { validarTamanho } from './tamanho';
import { LIMITES } from '../config/limites';

const ctxFake = (tamanhoBytes: number, tipo: any) =>
  ({ nomeArquivo: 'x', bytes: new Uint8Array(), tamanhoBytes, tipo, pdf: null,
     config: { pdfa: {} as any } }) as any;

test('exatamente no limite -> sem ocorrência', () => {
  expect(validarTamanho(ctxFake(LIMITES.TAMANHO_MAX_BYTES, 'application/pdf'))).toEqual([]);
});
test('um byte acima -> TAMANHO_EXCEDIDO erro', () => {
  const o = validarTamanho(ctxFake(LIMITES.TAMANHO_MAX_BYTES + 1, 'application/pdf'));
  expect(o[0]!.codigo).toBe('TAMANHO_EXCEDIDO');
  expect(o[0]!.gravidade).toBe('erro');
  expect(o[0]!.detalheTecnico).toContain('1');
});
test('MP4 grande -> correção RECODIFICAR_MIDIA', () => {
  const o = validarTamanho(ctxFake(50 * 1024 * 1024, 'video/mp4'));
  expect(o[0]!.correcaoDisponivel).toBe('RECODIFICAR_MIDIA');
});
```

- [ ] **Step 2–5:** falhar → implementar → passar → `git commit -m "feat: Regra 2 — validador de tamanho (spec §7.2)"`

---

## Task 10: Regra 3 nível 1 — declaração PDF/A (XMP)

**Files:**
- Create: `src/validadores/pdfaDeclaracao.ts`
- Test: `src/validadores/pdfaDeclaracao.test.ts`

**Interfaces:**
- Consumes: `ContextoArquivo`.
- Produces:
  ```ts
  export function validarPdfaDeclaracao(ctx: ContextoArquivo): Ocorrencia[];
  ```
- Regra (spec §7.3 nível 1): só PDF. Se `ctx.config.pdfa.pdfaObrigatorio === false` → `[]`. Se `ctx.pdf.pdfaId === null` → `PDFA_NAO_DECLARADO` com gravidade `ctx.config.pdfa.pdfaGravidade`. Se declarado mas `parte` ∉ `pdfaPartesAceitas` → ocorrência `PDFA_NAO_DECLARADO`? Não — usar `PDFA_DECLARACAO_INCONSISTENTE`? A spec não dá código para "parte não aceita"; usar `PDFA_NAO_DECLARADO` seria errado. **Decisão:** emitir `PDFA_DECLARACAO_INCONSISTENTE` (`erro`) com mensagem "declara PDF/A parte N, fora da lista aceita". Registrar `pdfaParte`/`pdfaConformidade` no resultado sempre que declarado (o orquestrador lê de `ctx.pdf.pdfaId`).

- [ ] **Step 1: Testes** (14.1): PDF/A-1b → `[]`, e o orquestrador reporta `pdfaParte:1`; PDF sem XMP → `PDFA_NAO_DECLARADO` com gravidade `aviso` (padrão); com `pdfaGravidade:'erro'` → gravidade `erro`; com `pdfaObrigatorio:false` → `[]`.

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: Regra 3 nível 1 — declaração PDF/A (spec §7.3)`.

---

## Task 11: Regra 3 nível 2 — verificações estruturais PDF/A

**Files:**
- Create: `src/validadores/pdfaEstrutura.ts`
- Test: `src/validadores/pdfaEstrutura.test.ts`

**Interfaces:**
- Consumes: `ContextoArquivo` (usa `ctx.pdf.carga.doc` quando `ok`, senão só `ctx.pdf.trailer` + varredura bruta).
- Produces: `export function validarPdfaEstrutura(ctx: ContextoArquivo): Ocorrencia[]`

**Tabela (spec §7.3 nível 2), sempre executada quando for PDF e `pdfaObrigatorio`:**

| Condição | Código | Gravidade |
|---|---|---|
| `trailer.temEncrypt` | `PDFA_CRIPTOGRAFADO` | erro |
| sem `/OutputIntents` com `/S /GTS_PDFA1` | `PDFA_SEM_OUTPUTINTENT` | erro |
| alguma fonte sem `FontFile`/`FontFile2`/`FontFile3` | `PDFA_FONTE_NAO_EMBUTIDA` | erro |
| `/JavaScript`/`/JS`/`/AA`/`/OpenAction` com script | `PDFA_JAVASCRIPT` | erro |
| `/EmbeddedFiles` | `PDFA_ARQUIVO_EMBUTIDO` | erro se parte ∈ {1,2} ou não declarado; aviso se parte 3 |
| transparência (`/SMask`, `/CA`/`/ca` < 1, `/Group` `/S /Transparency`) | `PDFA_TRANSPARENCIA` | erro se parte 1 ou não declarado; ignora nas demais |
| `/Launch`/`/GoToR`/referência externa | `PDFA_REFERENCIA_EXTERNA` | erro |

Se `ctx.pdf.pdfaId !== null` **e** houver qualquer ocorrência `erro` acima → adicionar `PDFA_DECLARACAO_INCONSISTENTE` (`erro`).

Implementação: varredura por regex de bytes (funciona no worker, sem DOM) via um helper `varrerEstruturaPdfa(bytes): { ... flags }` em `src/pdf/estrutura.ts` (estender a Task 5 — adicionar ao mesmo arquivo, mesma técnica Latin-1). Padrões:
- OutputIntent: `/OutputIntents` presente **e** `/S\s*/GTS_PDFA1`.
- Fonte não embutida: para cada `/BaseFont` com `/Subtype /Type1|/TrueType|/Type0`, checar se há `FontFile[23]?` no mesmo descritor — heurística: contar `/FontDescriptor` sem `FontFile` adjacente.
- Transparência: `/SMask\s*/?[^N]` (ignorar `/SMask /None`), `/ca\s+0?\.\d`, `/CA\s+0?\.\d`, `/Group\s*<<[^>]*/S\s*/Transparency`.

- [ ] **Step 1: Testes** (14.1): PDF com fonte não embutida → `PDFA_FONTE_NAO_EMBUTIDA`; PDF que declara PDF/A-1b sem OutputIntents → `PDFA_SEM_OUTPUTINTENT` + `PDFA_DECLARACAO_INCONSISTENTE`; PDF/A-2b com transparência → **sem** `PDFA_TRANSPARENCIA`; PDF criptografado → `PDFA_CRIPTOGRAFADO`.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** `varrerEstruturaPdfa` + `validarPdfaEstrutura`.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "feat: Regra 3 nível 2 — verificações estruturais PDF/A (spec §7.3)"`

---

## Task 12: `src/validadores/registro.ts` — registro de validadores por tipo

**Files:**
- Create: `src/validadores/registro.ts`
- Test: `src/validadores/registro.test.ts`

**Interfaces:**
- Consumes: os 4 validadores acima.
- Produces:
  ```ts
  export interface Validador {
    nome: string;
    etapa: string;                        // mensagem de etapa da spec §6
    aplicaA: (tipo: TipoDetectado) => boolean;
    executar: (ctx: ContextoArquivo) => Ocorrencia[];
  }
  export const VALIDADORES: readonly Validador[];
  ```
- Ordem e `etapa` (spec §6): assinatura → "Procurando assinatura digital…"; pdfaDeclaracao + pdfaEstrutura → "Verificando o formato PDF/A…"; tamanho → "Conferindo o tamanho…".

- [ ] **Step 1: Teste** — `VALIDADORES` contém os 4; para `audio/mpeg` só `tamanho` `aplicaA` retorna true; para `application/pdf` os 4 aplicam.

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: registro de validadores desacoplado da UI (spec §15)`.

---

## Task 13: `src/validadores/validarArquivo.ts` — orquestrador

**Files:**
- Create: `src/validadores/validarArquivo.ts`
- Test: `src/validadores/validarArquivo.test.ts`

**Interfaces:**
- Consumes: `detectarTipo` (Task 4), `montarContexto` (Task 7), `VALIDADORES` (Task 12).
- Produces:
  ```ts
  export interface OpcoesValidacao {
    onEtapa?: (mensagem: string) => void;   // "Lendo o arquivo…" etc
    config?: { pdfa: typeof PDFA };
  }
  export function validarArquivo(
    nomeArquivo: string, bytes: ArrayBuffer, opcoes?: OpcoesValidacao,
  ): Promise<ResultadoValidacao>;
  ```
- Fluxo:
  1. `onEtapa("Lendo o arquivo…")`.
  2. `onEtapa("Verificando o tipo do arquivo…")` → `detectarTipo`. `null` → resultado com `FORMATO_NAO_SUPORTADO` (`erro`, `correcaoDisponivel:null`), `apto:false`, `corrigivel:false`, `tipoDetectado:null`. Return.
  3. Se PDF: `montarContexto`. `carga.ok === false && motivo === 'ARQUIVO_CRIPTOGRAFADO'` → ocorrência `ARQUIVO_CRIPTOGRAFADO` (`erro`), `corrigivel:false`. `'ARQUIVO_CORROMPIDO'` idem. Ainda assim rodar `validarTamanho`.
  4. Rodar cada `Validador` aplicável, emitindo `onEtapa(v.etapa)` antes; concatenar ocorrências.
  5. `pdfaParte`/`pdfaConformidade` de `ctx.pdf?.pdfaId`.
  6. `apto = !ocorrencias.some(o => o.gravidade === 'erro')`.
  7. `corrigivel = ocorrencias.some(o => o.correcaoDisponivel !== null) && !ocorrencias.some(o => ['ARQUIVO_CRIPTOGRAFADO','ARQUIVO_CORROMPIDO','FORMATO_NAO_SUPORTADO','PDFA_CRIPTOGRAFADO'].includes(o.codigo))`.

- [ ] **Step 1: Escrever os testes de aceite da spec §14.1** — um `test` por bullet, usando fixtures da Task 30:
  - `simples.pdf` (1 MB) → `apto:true`, `ocorrencias:[]`.
  - `assinado.pdf` → contém `ASSINATURA_PRESENTE`, `apto:false`, `corrigivel:true`.
  - `campo-sig-vazio.pdf` → `CAMPO_ASSINATURA_VAZIO` aviso, `apto:true`.
  - `limite-exato.pdf` (10_485_760 B) → sem `TAMANHO_EXCEDIDO`.
  - `acima-limite.pdf` (10_485_761 B) → `TAMANHO_EXCEDIDO`, `apto:false`.
  - `criptografado.pdf` → `ARQUIVO_CRIPTOGRAFADO`, `corrigivel:false`.
  - `falso.pdf` (bytes de MZ com nome .pdf) → `FORMATO_NAO_SUPORTADO`.
  - `audio.mp3`, `video.mp4` abaixo do limite → `apto:true`, e nenhuma ocorrência com código começando por `PDFA_` ou `ASSINATURA`.
  - `pdfa-1b.pdf` → `apto:true`, `pdfaParte:1`, `pdfaConformidade:'B'`.
  - `pdfa-2b-transparencia.pdf` → `apto:true`, sem `PDFA_TRANSPARENCIA`.
  - `declara-a1b-sem-oi.pdf` → contém `PDFA_DECLARACAO_INCONSISTENTE` **e** `PDFA_SEM_OUTPUTINTENT`.
  - `fonte-nao-embutida.pdf` → `PDFA_FONTE_NAO_EMBUTIDA`.
  - config `pdfaObrigatorio:false` → nenhuma ocorrência `PDFA_*`.
  - config `pdfaGravidade:'aviso'` em `simples-sem-pdfa.pdf` → ocorrência `PDFA_NAO_DECLARADO` presente e `apto:true`.
  - **lote de 5**: `Promise.all` de 5 chamadas → 5 resultados; alterar `config` numa não afeta as outras (passar `config` por chamada).

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar o orquestrador** conforme o fluxo acima.

- [ ] **Step 4: Rodar e ver passar** (toda a suíte `validarArquivo.test.ts`).

- [ ] **Step 5: Commit** — `git commit -m "feat: orquestrador de validação -> ResultadoValidacao (spec §12, §14.1)"`

---

## Task 14: `src/orientacao/manual.ts` — orientação textual e fluxo encadeado §7.4

**Files:**
- Create: `src/orientacao/manual.ts`
- Test: `src/orientacao/manual.test.ts`

**Interfaces:**
- Consumes: `Ocorrencia[]`.
- Produces:
  ```ts
  export interface PassoManual { titulo: string; detalhe: string; }
  export interface OrientacaoManual { resumo: string; passos: PassoManual[]; }
  export function montarOrientacaoManual(ocorrencias: Ocorrencia[]): OrientacaoManual[];
  ```
- Regra §7.4: se houver `ASSINATURA_PRESENTE` **e** qualquer `PDFA_*` (exceto `PDFA_CRIPTOGRAFADO`) → **uma única** `OrientacaoManual` com dois passos encadeados (1. reimprimir pelo navegador para remover a assinatura; 2. abrir o resultado no LibreOffice e exportar como PDF/A) — nunca as duas orientações soltas. Caso contrário, uma `OrientacaoManual` por grupo de código.

- [ ] **Step 1: Teste** (14 / §7.4): entrada com `ASSINATURA_PRESENTE` + `PDFA_NAO_DECLARADO` → `montarOrientacaoManual` retorna **array de length 1** com `passos.length === 2`, e o texto do passo 2 menciona "PDF/A" e "LibreOffice". Entrada só com `TAMANHO_EXCEDIDO` → 1 orientação com passo sobre reduzir/dividir.

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: orientação manual com fluxo encadeado assinatura+PDF/A (spec §7.4)`.

---

## Task 15: `src/estado/maquinaLinha.ts` — máquina de estados da linha

**Files:**
- Create: `src/estado/maquinaLinha.ts`
- Test: `src/estado/maquinaLinha.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type EstadoLinha =
    | 'aguardando' | 'validando' | 'apto' | 'inapto'
    | 'corrigindo' | 'corrigido' | 'correcao_falhou' | 'nao_corrigivel';
  export const TRANSICOES: Record<EstadoLinha, readonly EstadoLinha[]>;
  export function transicionar(atual: EstadoLinha, proximo: EstadoLinha): EstadoLinha; // lança em dev se inválida
  export const TEXTO_ESTADO: Record<EstadoLinha, string>; // textos literais da spec §6
  ```
- `TRANSICOES` (derivado da spec §5–6):
  - `aguardando` → `validando`
  - `validando` → `apto`, `inapto`
  - `inapto` → `corrigindo`
  - `corrigindo` → `corrigido`, `correcao_falhou`, `nao_corrigivel`
  - `apto`, `corrigido`, `correcao_falhou`, `nao_corrigivel` → (terminais; só `aguardando` via "Limpar tudo"/re-adição, tratado fora da máquina)
- `transicionar`: se `proximo ∉ TRANSICOES[atual]` → em `import.meta.env.DEV` (ou `process.env.NODE_ENV !== 'production'`) lança `Error(\`transição inválida: ${atual} -> ${proximo}\`)`; em produção retorna `atual` e registra `console.error`.

- [ ] **Step 1: Testes** (14.2): `transicionar('aguardando','validando') === 'validando'`; `transicionar('validando','apto') === 'apto'`; `expect(() => transicionar('aguardando','corrigido')).toThrow(/transição inválida/)`; `TEXTO_ESTADO.apto === 'Pronto para anexar ao PJe'`; `TEXTO_ESTADO.corrigido === 'Corrigido — revalidado com sucesso'`.

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: máquina de estados explícita da linha (spec §6, §14.2)`.

---

## Task 16: `src/infra/blobRegistry.ts` — registro e revogação de Blob URLs

**Files:**
- Create: `src/infra/blobRegistry.ts`
- Test: `src/infra/blobRegistry.test.ts`

**Interfaces:**
- Produces (assinatura literal da spec §9.4):
  ```ts
  export function criarDownload(id: string, blob: Blob, nome: string): { url: string; nome: string };
  export function descartar(id: string): void;
  export function descartarTudo(): void;
  export function contarAtivos(): number; // p/ testes
  ```
- Registrar `addEventListener('pagehide', descartarTudo)` no módulo. `criarDownload` revoga id anterior antes de criar.

- [ ] **Step 1: Testes** (14.4): espião em `URL.createObjectURL`/`URL.revokeObjectURL` (mock no jsdom). `criarDownload('a', blob, 'a.pdf')` → `createObjectURL` chamado 1×. `criarDownload('a', blob2, 'a.pdf')` de novo → `revokeObjectURL` do anterior 1×. `descartarTudo()` após 3 ids → `revokeObjectURL` 3× e `contarAtivos() === 0`. Disparar evento `pagehide` → `descartarTudo` roda.

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: registro central de Blob URLs com revogação garantida (spec §9.4)`.

---

## Task 17: `src/infra/ociosidade.ts` — timer de ociosidade

**Files:**
- Create: `src/infra/ociosidade.ts`
- Test: `src/infra/ociosidade.test.ts`

**Interfaces:**
- Consumes: `LIMITES.OCIOSIDADE_MS`.
- Produces:
  ```ts
  export function iniciarOciosidade(onExpirar: () => void, ms?: number): { parar: () => void; cutucar: () => void };
  ```
- Reinicia o timer em `pointerdown`, `keydown`, `dragover` no `window`. `cutucar()` reinicia manualmente (ao adicionar arquivo/validar). `parar()` remove listeners e limpa timer.

- [ ] **Step 1: Testes** com `vi.useFakeTimers()`: sem atividade por `OCIOSIDADE_MS` → `onExpirar` chamado 1×. `cutucar()` antes do fim adia. `parar()` impede disparo.

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: timer de ociosidade de 30 min (spec §9.5)`.

---

## Task 18: `src/workers/` — worker de validação + protocolo

**Files:**
- Create: `src/workers/protocolo.ts`, `src/workers/validacao.worker.ts`
- Test: `src/workers/validacao.worker.test.ts` (usa `@vitest/web-worker`)

**Interfaces:**
- `protocolo.ts`:
  ```ts
  export type ParaWorker = { tipo: 'validar'; nomeArquivo: string; buffer: ArrayBuffer };
  export type DoWorker =
    | { tipo: 'etapa'; mensagem: string }
    | { tipo: 'resultado'; resultado: ResultadoValidacao }
    | { tipo: 'erro'; mensagem: string };
  ```
- `validacao.worker.ts`: `self.onmessage = async (e: MessageEvent<ParaWorker>) => { … }` — chama `validarArquivo(nome, buffer, { onEtapa: m => self.postMessage({tipo:'etapa', mensagem:m}) })`, posta `{tipo:'resultado', …}`. `try/catch` → `{tipo:'erro', mensagem}`. **Não** importa nada de `src/ui/**` nem `react`.

- [ ] **Step 1: Teste** (`@vitest/web-worker` habilitado em `vitest.config.ts` via `setupFiles: ['@vitest/web-worker']`): criar `new Worker(new URL('./validacao.worker.ts', import.meta.url), { type: 'module' })`, postar `{tipo:'validar', nomeArquivo:'simples.pdf', buffer}` (transferindo o buffer), coletar mensagens: deve haver ≥1 `etapa` e exatamente 1 `resultado` com `apto:true`. Para `assinado.pdf` → `resultado.ocorrencias` contém `ASSINATURA_PRESENTE`.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** protocolo + worker.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "feat: worker de validação com protocolo de mensagens (spec §11)"`

---

## Task 19: `src/execucao/orquestrador.ts` — 1 worker por arquivo, sequencial

**Files:**
- Create: `src/execucao/orquestrador.ts`
- Test: `src/execucao/orquestrador.test.ts`

**Interfaces:**
- Consumes: protocolo (Task 18).
- Produces:
  ```ts
  export interface CallbacksLote {
    onEstado: (indice: number, estado: EstadoLinha) => void;
    onEtapa: (indice: number, mensagem: string) => void;
    onResultado: (indice: number, resultado: ResultadoValidacao) => void;
  }
  export interface FabricaWorker { (): Worker }  // injetável p/ teste
  export function processarLote(
    arquivos: File[], cb: CallbacksLote, fabricaWorker?: FabricaWorker,
  ): Promise<void>;
  ```
- Comportamento:
  - Para cada arquivo, **em ordem, aguardando o anterior**: `onEstado(i, 'validando')`; `const w = fabricaWorker()`; `const buffer = await arquivos[i].arrayBuffer()`; `w.postMessage({tipo:'validar', nomeArquivo, buffer}, [buffer])`; encaminha `etapa`/`resultado`; ao receber `resultado` → `onEstado(i, resultado.apto ? 'apto' : 'inapto')`, `onResultado(i, resultado)`; `finally { w.terminate() }`.
  - Erro do worker (`{tipo:'erro'}` ou `onerror`) → `onResultado(i, resultadoCorrompido(nome, tamanho))` com `ARQUIVO_CORROMPIDO`, `onEstado(i,'inapto')`, **e segue para o próximo** (não lança).
  - `fabricaWorker` default: `() => new Worker(new URL('../workers/validacao.worker.ts', import.meta.url), { type: 'module' })`.

- [ ] **Step 1: Testes** (14.2 / 14.4):
  - Fábrica fake que devolve um `FakeWorker` (EventTarget com `postMessage`/`terminate` espionados) que responde `resultado` após `queueMicrotask`. Processar 5 `File` → `terminate` chamado 5×; nenhum worker "vivo" (contador de criados − terminados === 0).
  - Em qualquer instante no máximo 1 índice em `'validando'` — registrar todas as chamadas `onEstado` e assertar que nunca há dois `'validando'` simultâneos (sequência: `validando i`, depois `apto|inapto i`, só então `validando i+1`).
  - Fábrica cujo 2º worker dispara `{tipo:'erro'}` → resultado do índice 1 tem `ARQUIVO_CORROMPIDO`; índice 2 é processado normalmente; `processarLote` resolve sem rejeitar.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar.**

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "feat: orquestração sequencial com worker por arquivo (spec §5, §9.2, §14.2)"`

---

## Task 20: `src/estado/store.ts` — estado global (useReducer + Context)

**Files:**
- Create: `src/estado/store.ts`, `src/estado/store.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ItemArquivo {
    id: string;
    file: File;                 // referência preguiçosa — nunca ArrayBuffer aqui
    tipoRapido: TipoDetectado | null; // lido dos 1os bytes ao adicionar
    estado: EstadoLinha;
    etapa: string | null;
    resultado: ResultadoValidacao | null;
  }
  export type AcaoStore =
    | { t: 'adicionar'; itens: ItemArquivo[] }
    | { t: 'remover'; id: string }
    | { t: 'limparTudo' }
    | { t: 'estado'; id: string; estado: EstadoLinha }
    | { t: 'etapa'; id: string; etapa: string }
    | { t: 'resultado'; id: string; resultado: ResultadoValidacao }
    | { t: 'ociosidadeExpirou' };
  export interface EstadoStore { itens: ItemArquivo[]; ociosidade: boolean; }
  export function reducer(estado: EstadoStore, acao: AcaoStore): EstadoStore;
  export const StoreProvider: React.FC<{ children: React.ReactNode }>;
  export function useStore(): { estado: EstadoStore; dispatch: React.Dispatch<AcaoStore> };
  ```
- `reducer` usa `transicionar` da Task 15 nas ações `estado`. `limparTudo` e `ociosidadeExpirou` → `itens: []` e chamam `descartarTudo()` (via efeito no provider, não no reducer puro — reducer só zera; provider observa e revoga).

- [ ] **Step 1: Testes do reducer** (puro): `adicionar` acrescenta; `remover` tira por id; `limparTudo` → `itens:[]`; `estado` inválido propaga throw de `transicionar` em dev; `resultado` guarda o objeto e não muda estado.

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: store de estado com File preguiçoso (spec §9.3)`.

---

## Task 21: `src/ui/icones.tsx` + `EstadoLinha.tsx` — sinalização por forma, cor e rótulo

**Files:**
- Create: `src/ui/icones.tsx`, `src/ui/EstadoLinha.tsx`, `src/ui/EstadoLinha.module.css`
- Test: `src/ui/EstadoLinha.test.tsx`

**Interfaces:**
- `icones.tsx`: `CirculoCheck`, `TrianguloExclamacao`, `Spinner` (SVG inline, `aria-hidden`, `role="img"` no wrapper com `<title>`), `width`/`height` via prop, `currentColor`.
- `EstadoLinha.tsx`:
  ```ts
  export function EstadoLinha(props: { estado: EstadoLinha; etapa: string | null; resumo: string | null }): JSX.Element;
  ```
  - Ícone por **forma** (spec §1.7): `apto`/`corrigido` → `CirculoCheck`; `inapto`/`correcao_falhou`/`nao_corrigivel` → `TrianguloExclamacao`; `validando`/`corrigindo` → `Spinner`; `aguardando` → círculo vazio neutro.
  - **Rótulo textual sempre presente** ao lado do ícone: usa `TEXTO_ESTADO[estado]` ou `etapa`/`resumo`.
  - Container com `role="status"` e `aria-live="polite"` (spec §6); nunca `assertive`.
  - Classe de cor por estado via CSS Module (`neutro`/`verde`/`vermelho`/`ambar`) — a cor é redundante, não portadora única.
  - `Spinner` respeita `@media (prefers-reduced-motion: reduce)` (sem animação; troca por "…" pulsante textual).

- [ ] **Step 1: Testes** (RTL + jest-axe): para `estado='apto'` → há SVG com `<title>` "aprovado"/"apto" **e** texto "Pronto para anexar ao PJe" visível. Para `inapto` → título "não apto" e o `resumo` renderizado. `getByRole('status')` tem `aria-live="polite"`. `axe` sem violações. Snapshot dos 8 estados.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** ícones + componente + CSS Module com tokens (`var(--cor-ok)` etc, definidos na Task 26; por ora referenciar as custom properties).

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "feat: sinalização de estado por forma+cor+rótulo com aria-live polite (spec §1.7, §6)"`

---

## Task 22: `src/ui/LinhaArquivo.tsx` + `ListaArquivos.tsx`

**Files:**
- Create: `src/ui/LinhaArquivo.tsx`, `src/ui/ListaArquivos.tsx`, `*.module.css`
- Test: `src/ui/LinhaArquivo.test.tsx`

**Interfaces:**
- `LinhaArquivo` props: `{ item: ItemArquivo; onRemover: (id: string) => void }`.
- Mostra: nome (truncado com `title`), tipo (`tipoRapido` legível: "PDF"/"MP3"/"MP4"/"desconhecido"), tamanho formatado com **números tabulares** (`font-variant-numeric: tabular-nums`), `<EstadoLinha>`, botão `x` "Remover da lista" (só quando não está `validando`/`corrigindo`).
- Helper `formatarTamanho(bytes): string` em `src/ui/formato.ts` (+ teste): "1,00 MB", "512 KB", "9,99 MB" — pt-BR, sempre 2 casas para MB.
- `ListaArquivos` renderiza `<ul>` de `LinhaArquivo` + `<Diagnostico>` embaixo de cada linha com `resultado`.

- [ ] **Step 1: Testes**: `formatarTamanho(10_485_760)` → `'10,00 MB'`; `formatarTamanho(1024)` → `'1,00 KB'`. `LinhaArquivo` com item `aguardando` mostra nome, "PDF", tamanho e "Aguardando validação"; clicar `x` chama `onRemover(id)`; item `validando` não mostra `x`.

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: linha e lista de arquivos com tamanho tabular (spec §5, §1.7)`.

---

## Task 23: `src/ui/AreaUpload.tsx` — drag/drop + input real + limites de lote

**Files:**
- Create: `src/ui/AreaUpload.tsx`, `*.module.css`
- Test: `src/ui/AreaUpload.test.tsx`

**Interfaces:**
- Props: `{ onArquivos: (itens: ItemArquivo[]) => void; totalAtual: number; onRecusa: (msg: string) => void }`.
- `<input type="file" multiple>` **real**, visualmente sob a área de drop (`position:absolute; inset:0; opacity:0; cursor:pointer`), rotulado (`aria-label="Selecionar arquivos para validar"`).
- Ao receber arquivos (drop ou change):
  - Se `totalAtual + novos > LIMITES.MAX_ARQUIVOS_LOTE` → `onRecusa("Máximo de 20 arquivos por vez. Remova alguns e tente de novo.")` e **não adiciona nenhum** (ou adiciona só até o limite — **decisão: recusa o lote inteiro** para mensagem clara, spec §14.2).
  - Para cada arquivo: se `file.size > LIMITES.TAMANHO_ABSOLUTO_LEITURA_BYTES` → cria `ItemArquivo` já com `resultado` `TAMANHO_EXCEDIDO`/`estado:'inapto'` **sem ler os bytes** (spec §10.2). Senão lê `file.slice(0, 1024).arrayBuffer()` → `detectarTipo` → `tipoRapido`.
  - `onArquivos(itens)`.
- Zona destacada visualmente no `dragover`; `prefers-reduced-motion` respeitado.

- [ ] **Step 1: Testes** (RTL + user-event): `upload` de 2 arquivos → `onArquivos` com 2 itens, `tipoRapido` correto para um `%PDF-` sintético. `totalAtual=19` + soltar 2 → `onRecusa` chamado, `onArquivos` não. Arquivo com `size` gigante (stub `File` com `size` sobrescrito) → item vem `inapto` e `arrayBuffer` **não** foi chamado (espião). Input é `getByLabelText(/selecionar arquivos/i)` e é focável por teclado.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar.**

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "feat: área de upload com input real e limites de lote/tamanho (spec §5, §10.2, §11)"`

---

## Task 24: `src/ui/BotaoValidar.tsx`

**Files:**
- Create: `src/ui/BotaoValidar.tsx`, `src/ui/BotaoValidar.test.tsx`

**Interfaces:**
- Props: `{ habilitado: boolean; validando: boolean; onValidar: () => void }`.
- Lista vazia (`habilitado === false`): `aria-disabled="true"`, `disabled`, e um texto associado por `aria-describedby` — "Adicione ao menos um arquivo para validar." (spec §5 item 3, §14.2).
- `validando === true`: rótulo "Validando…" e desabilitado.

- [ ] **Step 1: Testes**: sem arquivos → `getByRole('button', {name:/validar/i})` tem `aria-disabled="true"` e o texto explicativo está no DOM e referenciado por `aria-describedby`. Com arquivos → habilitado, clique chama `onValidar`.

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: botão Validar com aria-disabled e rótulo explicativo (spec §5, §14.2)`.

---

## Task 25: `src/ui/Diagnostico.tsx` — ocorrências + orientação manual

**Files:**
- Create: `src/ui/Diagnostico.tsx`, `*.module.css`, `src/ui/Diagnostico.test.tsx`

**Interfaces:**
- Props: `{ resultado: ResultadoValidacao }`.
- Renderiza, para `resultado`:
  - Se `apto` e sem ocorrências → nada além do estado da linha (a linha já diz "Pronto para anexar ao PJe").
  - Lista de `ocorrencias`: cada uma com badge de `gravidade` (texto "Erro"/"Aviso" + cor + ícone de forma), `mensagem`, `orientacao`; `detalheTecnico` dentro de `<details>` "Detalhe técnico".
  - Abaixo, `montarOrientacaoManual(resultado.ocorrencias)` → renderiza os passos (fluxo encadeado §7.4 aparece como **uma** lista ordenada de 2 itens).
  - **Fase 1: sem botão "Tentar corrigir".** Onde `corrigivel` for `true`, exibir apenas nota: "A correção automática chega na próxima versão. Por ora, siga os passos acima." (Fase 2 substitui por botão — Task P2-10.)
  - `nao_corrigivel`/cripto: mostrar motivo + orientação para remover a proteção na origem; nenhum botão.

- [ ] **Step 1: Testes**: `resultado` com `ASSINATURA_PRESENTE`+`PDFA_NAO_DECLARADO` → exatamente **uma** `<ol>` de orientação com 2 `<li>`; `resultado` `apto` sem ocorrências → componente não renderiza lista de ocorrência; `ARQUIVO_CRIPTOGRAFADO` → texto de "remover a proteção" presente, nenhum `button` de corrigir.

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: painel de diagnóstico com orientação manual (spec §5, §7.4)`.

---

## Task 26: `src/ui/ControlesDescarte.tsx` + fio de descarte no App

**Files:**
- Create: `src/ui/ControlesDescarte.tsx`, `src/ui/ControlesDescarte.test.tsx`
- Modify: `src/estado/store.ts` (efeito de revogação), `src/App.tsx`

**Interfaces:**
- `ControlesDescarte` props: `{ temItens: boolean; ocioso: boolean; onLimparTudo: () => void }`.
- "Limpar tudo" visível sempre que `temItens`; ao clicar → `dispatch({t:'limparTudo'})`.
- Banner de ociosidade quando `ocioso`: "Os arquivos foram descartados por inatividade." (spec §9.5).
- No `StoreProvider`: `useEffect` que, quando `itens` fica vazio após `limparTudo`/`ociosidadeExpirou`, chama `descartarTudo()` do `blobRegistry`.

- [ ] **Step 1: Testes**: com itens → botão "Limpar tudo" presente; clique dispara callback. `ocioso` → banner com o texto exato. Teste de integração leve: montar `StoreProvider`, adicionar item com download registrado, `dispatch limparTudo` → `descartarTudo` (espião) chamado.

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: Limpar tudo, descarte por linha e banner de ociosidade (spec §9.5)`.

---

## Task 27: `src/ui/AvisoPrivacidade.tsx` — declaração visível + endereço oficial

**Files:**
- Create: `src/ui/AvisoPrivacidade.tsx`, `src/ui/AvisoPrivacidade.test.tsx`
- Modify: `src/config/limites.ts` → adicionar `export const ENDERECO_OFICIAL = 'https://<dominio-a-definir>';` (constante, editável num lugar só)

**Interfaces:**
- Renderiza perto da área de upload (spec §9.6, §10.4, §11): frase curta e verificável — "Seus arquivos ficam só na memória deste navegador. Nada é enviado para nenhum servidor e tudo some ao fechar a aba." + linha "Endereço oficial: {ENDERECO_OFICIAL}".

- [ ] **Step 1: Testes**: o texto de privacidade e o `ENDERECO_OFICIAL` aparecem; nenhuma promessa de "apagamento seguro" no texto (assert negativo por regex `/apagamento seguro|apaga com segurança/i` ausente).

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: aviso de privacidade e endereço oficial (spec §9.6, §10.4)`.

---

## Task 28: `src/App.tsx` — composição e ligação com o orquestrador

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.fluxo.test.tsx`

**Interfaces:**
- Consumes: tudo acima.
- Comportamento: `App` usa `useStore`; ao clicar Validar → `processarLote(itens.map(i=>i.file), { onEstado, onEtapa, onResultado })` mapeando índice→id; injeta `fabricaWorker` real. `iniciarOciosidade` no mount, `cutucar()` a cada ação relevante. Ordem visual: `<AvisoPrivacidade>`, `<AreaUpload>`, `<ControlesDescarte>`, `<BotaoValidar>`, `<ListaArquivos>`.

- [ ] **Step 1: Teste de fluxo** (RTL, `fabricaWorker` fake injetado via prop de teste `App({ fabricaWorker })`):
  - Upload de `simples.pdf` + `assinado.pdf` sintéticos → 2 linhas "Aguardando validação".
  - Clicar "Validar" → em algum momento uma linha mostra `role="status"` com texto de etapa; ao fim: linha 1 "Pronto para anexar ao PJe" (verde/CirculoCheck), linha 2 com `TrianguloExclamacao` + `ASSINATURA_PRESENTE` + orientação.
  - Nunca duas linhas em "validando" ao mesmo tempo (observar via mock de `onEstado`).
  - "Limpar tudo" → lista vazia, botão Validar volta a `aria-disabled`.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar a composição.**

- [ ] **Step 4: Rodar e ver passar** + `npm run lint`.

- [ ] **Step 5: Commit** — `git commit -m "feat: App compõe upload, validação sequencial e descarte (spec §5)"`

---

## Task 29: Estilo — tokens claro/escuro, movimento, responsivo

**Files:**
- Create: `src/estilos/tokens.css`, `src/estilos/global.css`
- Modify: `src/main.tsx` (importar css), todos os `*.module.css` para usar os tokens
- Test: `src/estilos/tema.test.tsx`

**Interfaces:**
- `tokens.css`: `:root { --cor-fundo; --cor-texto; --cor-ok; --cor-erro; --cor-atencao; --cor-neutro; --raio; --dur-transicao: 200ms; }` e bloco `@media (prefers-color-scheme: dark) { :root { … } }`. Cores OK/ERRO escolhidas com contraste AA em ambos os temas (verde não puro, vermelho não puro; par testado no diagrama de contraste).
- `global.css`: `font-variant-numeric` util, `:focus-visible` com anel visível, `@media (prefers-reduced-motion: reduce) { * { transition-duration: 0.01ms !important; animation: none !important; } }`, transições de estado de linha entre 150–250 ms.
- Layout responsivo: linha do arquivo colapsa para 2 linhas em `max-width: 480px`; área de toque ≥ 44px.

- [ ] **Step 1: Testes**: montar `EstadoLinha` e ler `getComputedStyle` da transição → duração entre 150 e 250 ms (jsdom devolve o valor declarado). Com `matchMedia('(prefers-reduced-motion: reduce)')` mockado `true`, o `Spinner` renderiza a variante textual (assert já coberto na Task 21; aqui reforço). Snapshot do `tokens.css` para travar regressão de nomes de variável.

- [ ] **Step 2–5:** falhar → implementar → passar → commit `feat: tema claro/escuro, movimento reduzido e responsivo (spec §1.7)`.

---

## Task 30: Acessibilidade — passe dedicado

**Files:**
- Modify: componentes conforme achados
- Test: `src/ui/a11y.test.tsx`

**Interfaces:**
- Nenhuma nova. Verificações (spec §11):
  - Ordem de tabulação: upload → Validar → (por linha) botão remover.
  - Erros de `AreaUpload`/`BotaoValidar` associados por `aria-describedby`.
  - `:focus-visible` visível em todos os interativos.
  - `jest-axe` sem violações em: tela vazia, tela com lista `aguardando`, tela pós-validação com 1 apto + 1 inapto.

- [ ] **Step 1: Testes** `jest-axe` nos 3 cenários + teste de ordem de foco com `user-event.tab()`.

- [ ] **Step 2: Rodar e ver falhar** (provável: falta de `label`, contraste, `aria-describedby`).

- [ ] **Step 3: Corrigir** os componentes.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "test: passe de acessibilidade com jest-axe e navegação por teclado (spec §11)"`

---

## Task 31: Service worker com allowlist por caminho

**Files:**
- Create: `src/sw.ts`, `src/registrarSw.ts`
- Modify: `vite.config.ts` (build do SW como entry separada, sem plugin PWA — manter deps mínimas), `src/main.tsx`
- Test: `src/sw.test.ts`

**Interfaces:**
- `sw.ts`: `install` → `caches.open('app-v1')` e `addAll(ALLOWLIST)` onde `ALLOWLIST` é lista **literal** de caminhos (`/`, `/index.html`, `/assets/*` é resolvido em build — usar `self.__ASSETS__` injetado). `fetch` handler: responde do cache só para requisições **same-origin** cujo `URL.pathname` casa a allowlist; **nunca** cacheia `blob:`/`data:`/opaque/Range; para o resto, `fetch(event.request)` sem cache. `activate` → apaga caches antigos.
- Função pura testável: `export function podeCachear(url: string, origem: string): boolean`.

- [ ] **Step 1: Testes** de `podeCachear`: `('https://app/index.html','https://app') === true`; `('https://app/relatorio.pdf','https://app') === false`; `('blob:https://app/123','https://app') === false`; `('https://cdn.x/lib.js','https://app') === false`.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** SW + registro (`if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js')`).

- [ ] **Step 4: Rodar e ver passar** + `npm run build` (confere que `sw.js` sai na raiz do `dist`).

- [ ] **Step 5: Commit** — `git commit -m "feat: service worker com allowlist por caminho, sem cache de blobs (spec §9.1)"`

---

## Task 32: Cabeçalhos de segurança versionados

**Files:**
- Create: `public/_headers` (Cloudflare Pages)
- Modify: `vite.config.ts` → `server.headers` + `preview.headers` espelhando `_headers` (paridade dev)
- Create: `tests/headers/headersConfig.test.ts`, `docs/headers.md`

**Interfaces:**
- `public/_headers`:
  ```
  /*
    Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; connect-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
    Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
    X-Content-Type-Options: nosniff
    Referrer-Policy: no-referrer
    Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
    Cross-Origin-Opener-Policy: same-origin
    Cross-Origin-Resource-Policy: same-origin

  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  ```
  (COEP e `Access-Control-Allow-Origin` dos WASM entram na Fase 2 — Task P2-2.)
- Teste: parseia `_headers`, assere que `Content-Security-Policy` contém `connect-src 'self'`, `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`; que `X-Content-Type-Options: nosniff` e `Strict-Transport-Security` existem; que `/assets/*` tem `immutable`.

- [ ] **Step 1: Escrever o teste** `headersConfig.test.ts` (lê o arquivo, valida diretivas).

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Criar `_headers`, paridade no `vite.config.ts`, `docs/headers.md`** explicando cada linha e a relação com spec §10.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "feat: cabeçalhos de segurança versionados (spec §10.1, §10.3, §14.5)"`

---

## Task 33: `scripts/gerar-fixtures.ts` — fixtures sintéticas

**Files:**
- Create: `scripts/gerar-fixtures.ts`
- Modify: `package.json` → `"fixtures": "tsx scripts/gerar-fixtures.ts"`, devDep `tsx` (pinada), devDep `node-forge` (pinada) para o certificado autoassinado
- Test: `scripts/gerar-fixtures.test.ts`

**Interfaces:**
- Produces em `fixtures/`:
  - `simples.pdf` (~1 MB, texto real embutido, fonte embutida), `simples-sem-pdfa.pdf`
  - `assinado.pdf` (dicionário de assinatura com `/ByteRange`+`/Contents`, `/AcroForm` `/SigFlags 3`, campo `/T (Signature1)` com `/V`; assinatura calculada com cert **autoassinado gerado por `node-forge`**)
  - `campo-sig-vazio.pdf` (`/FT /Sig` sem `/V`)
  - `docmdp.pdf` (`/Perms << /DocMDP … >>`)
  - `pdfa-1b.pdf` (XMP `pdfaid:part=1 conformance=B` + `/OutputIntents` `GTS_PDFA1` + fontes embutidas)
  - `pdfa-2b-transparencia.pdf` (XMP part=2 + `/Group /S /Transparency`)
  - `declara-a1b-sem-oi.pdf` (XMP part=1 **sem** `/OutputIntents`)
  - `fonte-nao-embutida.pdf` (`/BaseFont /Helvetica` sem `FontFile`)
  - `criptografado.pdf` (com `/Encrypt` — usar `pdf-lib` não cifra; gerar via string PDF mínima com `/Encrypt` no trailer **ou** `qpdf` não disponível → construir PDF cru mínimo com dicionário `/Encrypt` só para acionar `EncryptedPDFError`/varredura). Alternativa: `hummus`/`muhammara` (pinada) que cifra. **Decisão: PDF cru mínimo com `/Encrypt`**, suficiente para os testes de detecção.
  - `corrompido.pdf` (`%PDF-1.4` + lixo)
  - `falso.pdf` (bytes `MZ…` — na verdade não-PDF, nome enganoso)
  - `imagens-pesadas.pdf` (~25 MB, JPEGs grandes — para Fase 2)
  - `limite-exato.pdf` (**exatamente** 10 485 760 B — padding via objeto de stream com comentário), `acima-limite.pdf` (**exatamente** 10 485 761 B)
  - `audio.mp3` (frame MPEG-1 Layer 3 válido mínimo + ID3v2), `video.mp4` (`ftyp isom` + `moov` mínimo), `audio-grande.mp3` (>10 MB via padding de frames), `video-grande.mp4`
- Nenhuma fixture é commitada (`.gitignore` cobre `fixtures/`). O CI roda `npm run fixtures` antes de `npm test`.

- [ ] **Step 1: Escrever o teste** `gerar-fixtures.test.ts`: executa a geração (ou importa a função `gerarTodas()`), depois para cada arquivo esperado: existe, e `detectarTipo(primeirosBytes)` devolve o tipo certo; `limite-exato.pdf` tem `statSync().size === 10_485_760`; `acima-limite.pdf` `=== 10_485_761`; `assinado.pdf` passa em `varrerTrailerBruto().temByteRangeEContents === true`.

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar** `gerarTodas()` + `main()`. Módulo exporta funções por fixture para reuso nos testes unitários que constroem variações.

- [ ] **Step 4: Rodar e ver passar** — `npm run fixtures && npm test -- scripts/gerar-fixtures.test.ts`.

- [ ] **Step 5: Commit** — `git commit -m "feat: gerador de fixtures sintéticas com cert autoassinado (spec §1.5)"`

> **Nota de sequência:** as Tasks 5–13 dependem de fixtures. Ao executar com subagents, **fazer a Task 33 logo após a Task 4** (fora de ordem numérica) para destravar os validadores. Deixada por último na numeração só para manter a leitura por assunto.

---

## Task 34: Teste de bundle — sem rede externa

**Files:**
- Create: `tests/bundle/semRedeExterna.test.ts`
- Modify: `package.json` → script `test:bundle` roda `vite build` e depois este teste

**Interfaces:**
- Após `npm run build`, ler todos os `dist/assets/*.js`:
  - Nenhuma ocorrência de URL absoluta `http://` ou `https://` que não seja `https://www.w3.org` / `http://www.aiim.org` (namespaces XML usados como string literal em `xmp.ts`) — allowlist explícita no teste.
  - Nenhuma chamada `sendBeacon`, `navigator.sendBeacon`.
  - `fetch(`/`XMLHttpRequest` só podem aparecer no chunk do service worker (`sw.js`) — no bundle da app, zero. (Regex sobre o texto minificado; documentar limitação.)
- Baseline de tamanho: chunk de entrada `< 400 KB` gzip (spec §1.2 "poucas centenas de KB") — falha se ultrapassar, para pegar dependência gorda por engano.

- [ ] **Step 1: Escrever o teste** com as asserções acima (usa `node:fs` + `zlib.gzipSync` para medir).

- [ ] **Step 2: Rodar e ver falhar** (se ainda não houver `dist/` — encadear `vite build` no script).

- [ ] **Step 3: Ajustar** o que o teste apontar (ex.: mover string de URL para constante permitida, garantir tree-shaking).

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git commit -m "test: bundle da Fase 1 sem rede externa e dentro do orçamento de tamanho (spec §14.5, §1.2)"`

---

## Task 35: E2E Playwright — fluxo, estados, descarte + evidências

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/fluxo.spec.ts`, `tests/e2e/descarte.spec.ts`, `tests/e2e/evidencias.spec.ts`
- Modify: `package.json` scripts

**Interfaces:**
- `playwright.config.ts`: `webServer` = `npm run preview` (build servido com os `_headers` via um pequeno server estático que aplica `public/_headers`, ou `@cloudflare/... ` — manter simples: um script `scripts/servir-com-headers.ts` de ~30 linhas). Projetos: `chromium` desktop 1280×800 e mobile 390×844; `colorScheme` `light` e `dark`.
- `fluxo.spec.ts` (spec §14.2): carrega a app, injeta fixtures sintéticas via `setInputFiles`, clica Validar, assere:
  - em cada instante no máximo uma linha com `[role=status]` de atividade (polling do DOM durante o processamento);
  - `simples.pdf` termina "Pronto para anexar ao PJe" com o SVG de check;
  - `assinado.pdf` termina vermelho com `ASSINATURA_PRESENTE` e a orientação manual;
  - `assinado-e-sem-pdfa.pdf` mostra **uma** lista ordenada de 2 passos (§7.4);
  - lote de 21 arquivos → mensagem de recusa, app não trava.
- `descarte.spec.ts` (spec §14.4): após validar, `localStorage.length === 0`, `sessionStorage.length === 0`, `indexedDB.databases()` vazio, `caches.keys()` sem entrada de blob (checar que nenhuma resposta cacheada tem `content-type` de PDF); `document.title` não contém nome de arquivo; recarregar (F5) → lista vazia; disparar timer de ociosidade (expor hook de teste `window.__forcarOciosidade__()` só quando `import.meta.env.DEV`) → banner aparece e lista limpa.
- `evidencias.spec.ts`: percorre **todos os 8 estados** da linha (forçando via hook de teste que injeta `resultado`/estado), tira screenshot em desktop/mobile × claro/escuro → salva em `docs/evidencias/<estado>-<viewport>-<tema>.png`; grava vídeo (`video: 'on'`) do ciclo upload → Validar → processando → vermelho → orientação → Limpar tudo → salva `docs/evidencias/ciclo-fase1.webm`.

- [ ] **Step 1: Escrever os specs** (red — app precisa de hooks de teste `window.__*__` guardados por `import.meta.env.DEV`).

- [ ] **Step 2: Rodar e ver falhar** — `npm run test:e2e`.

- [ ] **Step 3: Adicionar os hooks de teste** mínimos no `App`/`store` (só em DEV) e o `scripts/servir-com-headers.ts`.

- [ ] **Step 4: Rodar e ver passar**; conferir que os PNGs e o `.webm` foram gerados só com dados fictícios.

- [ ] **Step 5: Commit** — `git commit -m "test(e2e): fluxo, estados, descarte e evidências com fixtures sintéticas (spec §1.4, §14.2, §14.4)"`

---

## Task 36: Walkthrough da Fase 1

**Files:**
- Create: `docs/walkthrough-fase1.md`
- Modify: `README.md`

**Interfaces:**
- `docs/walkthrough-fase1.md` cobre (spec §1.4): como rodar (`npm i`, `npm run fixtures`, `npm run dev`), como testar (`npm test`, `npm run test:e2e`, `npm run test:bundle`), onde ficam as constantes de configuração (`src/config/limites.ts` — cada campo explicado, com destaque para `PDFA.pdfaGravidade` e `TAMANHO_MAX_BYTES`), quais cabeçalhos HTTP o deploy precisa (`public/_headers` + `docs/headers.md`), e a lista de evidências em `docs/evidencias/`.

- [ ] **Step 1:** Escrever o documento.
- [ ] **Step 2:** Revisar contra a spec §1.4 (todos os itens presentes).
- [ ] **Step 3: Commit** — `git commit -m "docs: walkthrough da Fase 1"`

---

## Self-Review (executada agora, contra a spec)

**Cobertura de spec:**
- §4 tipos por magic number → Task 4 ✅
- §5 fluxo de uso → Tasks 23, 24, 28 ✅ (item 6 "Tentar corrigir" é Fase 2, marcado explicitamente na Task 25)
- §6 estados + textos + mensagens de etapa + `aria-live=polite` → Tasks 15, 18, 21 ✅
- §7.1 Regra 1 (todas as 4 condições + aviso de campo vazio + nomes) → Tasks 5, 8 ✅
- §7.2 Regra 2 (limite exato, constante única, excedente) → Tasks 2, 9 ✅
- §7.3 Regra 3 níveis 1 e 2 + `PDFA_DECLARACAO_INCONSISTENTE` + configurabilidade → Tasks 6, 10, 11 ✅
- §7.4 conflito Regra 1 × Regra 3 (fluxo encadeado, caso de teste) → Tasks 14, 25, 35 ✅
- §9 ciclo de vida/descarte (worker por arquivo, `File` preguiçoso, blobRegistry, gatilhos, textos) → Tasks 16, 17, 19, 20, 23, 26, 27 ✅
- §10 segurança (CSP, headers, limites de auto-DoS, deps mínimas/pinadas) → Tasks 1, 23, 32, 34 ✅
- §11 não funcionais (worker, offline/SW, responsivo, acessível) → Tasks 18, 29, 30, 31 ✅
- §12 contrato de saída → Task 3 (tipos) + Task 13 (montagem) ✅
- §14.1 validação (todos os bullets) → Task 13 Step 1 ✅
- §14.2 fluxo e estados (todos os bullets) → Tasks 19, 24, 28, 35 ✅
- §14.4 descarte (todos os bullets, com ressalva §16.7 sobre memória) → Tasks 16, 19, 35 ✅
- §14.5 rede/bundle/headers (partes da Fase 1) → Tasks 32, 34, 35 ✅
- §1.5 fixtures sintéticas + cert autoassinado → Task 33 ✅
- §1.6 rules do workspace → Task 1 Step 4 ✅
- §1.7 frontend-design (forma+cor+rótulo, tabular, 150–250ms, reduced-motion, claro/escuro, sem fonte remota) → Tasks 21, 22, 29 ✅

**Lacunas conhecidas (intencionais, Fase 2):** botão "Tentar corrigir" e toda a §8; `Cross-Origin-Embedder-Policy` e `Access-Control-Allow-Origin` dos WASM (§10.1); teste de rede do ciclo de correção (§14.5 parte 2); chunk sem WASM (§14.5). Todas endereçadas no plano da Fase 2.

**Placeholders:** nenhum "TBD"/"etc" sem código. Onde há decisão de implementação (ex.: PDF criptografado sintético), está registrada explicitamente na Task.

**Consistência de tipos:** `ResultadoValidacao`/`Ocorrencia`/`EstrategiaCorrecao` (Task 3) usados igual em Tasks 8–13, 18–20, 25. `EstadoLinha` (Task 15) usado em 19, 20, 21, 28. `ContextoArquivo` (Task 7) consumido por 8–13. `ParaWorker`/`DoWorker` (Task 18) consumidos por 19. OK.

---

## Execução

Ao aprovar, seguir `superpowers:subagent-driven-development` (um subagente por task, revisão entre tasks) ou `superpowers:executing-plans` (inline com checkpoints). Ordem recomendada: 1 → 2 → 3 → 4 → **33** → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 24 → 25 → 26 → 27 → 28 → 29 → 30 → 31 → 32 → 34 → 35 → 36.
