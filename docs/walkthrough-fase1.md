# Walkthrough — Fase 1 (Validação)

Estado: **completa e verde de ponta a ponta**. Nenhum WASM, bundle leve.
A Fase 2 (correção automática) ainda não começou — ver
`superpowers/plans/2026-08-28-validador-pje-fase2.md`.

## Como rodar

```bash
npm install
npm run fixtures     # gera fixtures sintéticas em fixtures/ (gitignored)
npm run dev          # http://localhost:5173
```

`npm run build` gera `dist/` (estático). `npm run preview` serve `dist/` já com
os cabeçalhos de segurança (lidos de `public/_headers`).

## Como testar

| Comando | O que roda |
|---|---|
| `npm test` | Suíte unitária + integração (Vitest, jsdom). `pretest` regenera as fixtures. |
| `npm run test:bundle` | Build + verificação de que o bundle não fala com a rede e cabe no orçamento. |
| `npm run test:e2e` | Playwright: fluxo, descarte, ausência de rede externa, screenshots. Precisa de `npx playwright install chromium` uma vez. |
| `npm run lint` | `tsc --noEmit` (checagem de tipos). |

Contagem atual: ~170 testes unitários/integração + 29 e2e.

## Onde ficam as constantes de configuração

**Tudo em `src/config/limites.ts`** (regra do workspace: nenhum número literal
fora daí).

| Constante | Padrão | Efeito |
|---|---|---|
| `LIMITES.TAMANHO_MAX_BYTES` | `10 * 1024 * 1024` | Teto de tamanho por arquivo (Regra 2). Os tribunais divergem — mude só aqui. |
| `LIMITES.TAMANHO_ABSOLUTO_LEITURA_BYTES` | `100 MiB` | Acima disso o arquivo entra reprovado sem ser lido. |
| `LIMITES.MAX_ARQUIVOS_LOTE` | `20` | Lote acima disso é recusado inteiro. |
| `LIMITES.OCIOSIDADE_MS` | `30 min` | Timer que descarta a sessão por inatividade. |
| `LIMITES.REVOGACAO_BLOB_DELAY_MS` | `30 s` | Atraso para revogar Blob URL de download (Fase 2). |
| `LIMITES.TIMEOUT_CORRECAO_PDF_MS` | `120 s` | Timeout de correção de PDF (Fase 2). |
| `PDFA.pdfaObrigatorio` | `true` | Se `false`, a Regra 3 não gera nenhuma ocorrência. |
| `PDFA.pdfaGravidade` | `'aviso'` | Gravidade de toda a Regra 3. `'aviso'` mantém o arquivo apto; `'erro'` reprova. |
| `PDFA.pdfaPartesAceitas` | `[1,2,3,4]` | Partes da ISO 19005 aceitas na declaração XMP. |
| `ENDERECO_OFICIAL` | placeholder | Endereço oficial exibido na interface. Ajustar quando o domínio existir. |

## Cabeçalhos HTTP necessários no deploy

Versionados em **`public/_headers`** (formato Cloudflare Pages; o `vite preview`
espelha em dev). Resumo — detalhes e justificativa por linha na spec §10:

- `Content-Security-Policy` restritiva com **`connect-src 'self'`** (a linha que
  barra exfiltração mesmo com dependência comprometida), `object-src 'none'`,
  `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'none'`,
  `script-src 'self' 'wasm-unsafe-eval'` (o `wasm-...` é para a Fase 2).
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` mínima, `COOP: same-origin`.
- `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`.
- `/sw.js` → `Cache-Control: no-cache`.

Hospedar em plataforma com banda não medida para estático (Cloudflare Pages).
Fase 2 acrescenta `Access-Control-Allow-Origin` restrito nos `.wasm`.

## Arquitetura em uma tela

```
upload (AreaUpload) ──► store (useReducer) ──► orquestrador
                                                  │ 1 Worker por arquivo, sequencial,
                                                  │ terminate no finally (libera heap)
                                                  ▼
                                          validacao.worker
                                                  │ validarArquivo()
                                                  ▼
              detectarTipo ─► montarContexto ─► VALIDADORES[]
                                                  ├─ assinatura   (Regra 1)
                                                  ├─ pdfaDeclaracao(Regra 3 nível 1)
                                                  ├─ pdfaEstrutura (Regra 3 nível 2)
                                                  └─ tamanho       (Regra 2)
                                                  ▼
                                          ResultadoValidacao ─► máquina de estados ─► UI
```

- Validadores são funções puras `(ContextoArquivo) => Ocorrencia[]`, registradas
  em `src/validadores/registro.ts`. Nenhum acopla com a UI.
- A UI guarda o objeto `File`, nunca o `ArrayBuffer` — os bytes só existem
  dentro do worker, durante o processamento.
- Estados da linha e transições válidas: `src/estado/maquinaLinha.ts`. Transição
  inválida lança em desenvolvimento.
- Service worker (`src/sw.ts` + `src/sw/politica.ts`): cache dos próprios assets
  por allowlist de caminho; **nunca** um blob de documento.

## Evidências

`docs/evidencias/` — screenshots em desktop e mobile, claro e escuro:
tela inicial, lista aguardando, e resultado pós-validação (apto verde + inapto
vermelho + linha processando). Gravação do ciclo completo em `test-results/`
após `npm run test:e2e`.

## Decisões registradas no caminho

- **Tooling** subiu de versão em relação ao plano (vite 7, vitest 4, TS 5.9)
  para zerar `npm audit` — tudo dev-only. Ver commit de scaffold.
- **Regra 1 × §14.1**: `ASSINATURA_PRESENTE` (erro) exige evidência real
  (`/V`, `/ByteRange`+`/Contents`, `/Perms`/`DocMDP`/`UR3`, ou `SigFlags` com
  bit AppendOnly). Campo `/FT /Sig` vazio → `CAMPO_ASSINATURA_VAZIO` (aviso).
- **PDF/A nível 2** é heurística por varredura de bytes, não auditoria ISO 19005
  (fora de escopo, spec §15). `PDFA_FONTE_NAO_EMBUTIDA` dispara em
  `/Type /FontDescriptor` sem `/FontFile*`.
- Toda a Regra 3 segue `PDFA.pdfaGravidade` (padrão `aviso`), então um PDF comum
  continua **apto**.
