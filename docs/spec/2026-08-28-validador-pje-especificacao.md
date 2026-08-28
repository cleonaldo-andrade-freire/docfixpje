# Validador de Arquivos para Peticionamento no PJe — Especificação

> Documento único de especificação. É a entrada aprovada para o planejamento.
> Substitui `2026-08-28-docfixpje-especificacao.md` (versão anterior, truncada).
>
> **Data:** 2026-08-28

---

# 1. Ambiente de desenvolvimento

O projeto será desenvolvido no **Google Antigravity** (IDE), com o framework de
skills **Superpowers** e a skill **frontend-design** instalados e ativos.

## 1.1 Como este documento deve ser consumido

Este documento **já é a especificação aprovada**. Não execute a skill
`brainstorming` para redescobrir requisitos que já estão aqui — entre direto em
`writing-plans`, usando este texto como o design document de entrada.

Fluxo esperado:

1. `writing-plans` → Implementation Plan como Artifact, quebrado em tarefas
   pequenas o suficiente para revisão individual. Aguardar aprovação antes de
   codificar.
2. `executing-plans` / `subagent-driven-development` → executar tarefa a tarefa.
3. `test-driven-development` → red/green obrigatório em toda a camada de
   validação, correção e descarte. Os "Critérios de aceite" da seção 14 são os
   testes a escrever **primeiro**.
4. `systematic-debugging` → em qualquer falha, investigar causa raiz. Não
   relaxar asserção nem ajustar fixture para fazer teste passar.
5. `verification-before-completion` → nenhuma tarefa concluída sem evidência de
   execução.

Usar `Planning mode` para a fase 1.

## 1.2 Faseamento obrigatório

O plano deve entregar em duas fases, com a Fase 1 funcionando de ponta a ponta
antes de a Fase 2 começar:

- **Fase 1 — Validação.** Upload, botão Validar, processamento visível,
  diagnóstico verde/vermelho, orientação textual de correção manual, descarte,
  cabeçalhos de segurança. Nenhum WASM, bundle leve.
- **Fase 2 — Correção automática.** Motor de correção, carregado sob demanda.

Motivo: a Fase 1 sozinha já resolve o problema do usuário e cabe num bundle de
poucas centenas de KB. A Fase 2 adiciona dezenas de MB de WebAssembly e é onde
mora todo o risco técnico e jurídico do projeto. Se a Fase 2 atrasar ou se
mostrar inviável, a Fase 1 vai para produção sem ela.

## 1.3 Decisão bloqueante antes de iniciar a Fase 2

**Licença do motor de correção.** Ghostscript é AGPL; MuPDF também. Distribuir a
ferramenta publicamente com um build WASM desses motores embutido provavelmente
obriga a abrir o código da aplicação inteira. Resolver isso na fase de
planejamento, com decisão registrada como Artifact. Descobrir depois de
implementado custa a Fase 2 inteira.

## 1.4 Artifacts esperados no Agent Manager

- Implementation Plan (antes de qualquer código).
- Decisão de licença do motor de correção (antes da Fase 2).
- Task list com estado por tarefa.
- Screenshots da UI em desktop e mobile, claro e escuro, cobrindo **todos** os
  estados de linha da seção 6.
- Gravação de browser mostrando o ciclo completo: upload → Validar → linha
  processando → resultado vermelho → Corrigir → resultado verde → Limpar tudo.
- Walkthrough final com instruções de execução, teste, cabeçalhos HTTP
  necessários e localização das constantes de configuração.

## 1.5 Restrição crítica sobre o browser agent

O Antigravity é capaz de abrir a aplicação no navegador e verificar a UI
interagindo com ela. Essa verificação é bem-vinda — **exclusivamente com
fixtures sintéticas geradas pelo próprio projeto**.

É proibido, em qualquer etapa:

- Usar documento real de cliente, CTPS real, extrato real do gov.br ou qualquer
  arquivo contendo dado pessoal de terceiro como fixture de teste ou como
  insumo de verificação por browser.
- Baixar documentos de exemplo de sites de terceiros para servir de fixture.
- Deixar qualquer arquivo com dado pessoal no repositório, mesmo em
  `.gitignore`.

Todas as fixtures devem ser **geradas programaticamente** por
`scripts/gerar-fixtures.ts`, produzindo PDFs sintéticos com dados fictícios:
assinados, não assinados, com campo de assinatura vazio, PDF/A-1b, PDF/A-2b,
com fonte não embutida, criptografado, corrompido, com imagens pesadas para
testar compressão, e nos tamanhos exatos de fronteira. Screenshots e gravações
publicadas como Artifact não podem conter nada além desses dados fictícios.

Certificado de assinatura em fixture: sempre autoassinado, gerado no script.
Nunca um certificado real.

## 1.6 Rules do workspace

Criar `.agents/rules/` com, no mínimo:

- **`privacidade.md`** — "Nenhum byte de arquivo do usuário pode sair do
  navegador. Nenhuma chamada de rede em runtime além do download dos módulos
  WASM estáticos servidos pela própria origem. Nenhum conteúdo, nome de arquivo
  ou metadado de documento pode ser gravado em localStorage, sessionStorage,
  IndexedDB, Cache API, cookie, título da página, URL ou history. Qualquer
  sugestão de upload, telemetria ou API externa deve ser recusada e sinalizada."
  Always On.
- **`dominio-pje.md`** — glossário curto (PJe, peticionamento, PAdES,
  ICP-Brasil, PDF/A) para que subagentes não reinterpretem os termos.
- **`limites-config.md`** — "Nenhum limite numérico literal fora de
  `src/config/limites.ts`."
- **`correcao-honesta.md`** — "Nenhuma correção pode ser reportada como
  bem-sucedida sem revalidação do arquivo de saída pelos mesmos validadores. É
  proibido presumir sucesso a partir da ausência de exceção."

Instalar Superpowers preferencialmente como plugin de workspace
(`.agents/plugins/superpowers`).

## 1.7 Uso da skill frontend-design

- Ferramenta utilitária, densa e rápida — não landing page de SaaS. Nada de
  hero section, gradiente roxo, ícone de foguete ou card flutuante com sombra
  difusa. O usuário abre isso entre duas petições e quer o veredito em três
  segundos.
- O estado da linha (processando / aprovado / reprovado) é o elemento de maior
  peso visual da tela.
- Cor **nunca** é o único portador de significado. Verde e vermelho precisam vir
  acompanhados de ícone distinto em forma (círculo com check contra triângulo
  com exclamação) e de rótulo textual. A tela será usada por gente com
  daltonismo e em monitor ruim de fórum.
- Tipografia com números tabulares nos tamanhos de arquivo.
- Transições de estado perceptíveis mas curtas (150–250 ms), respeitando
  `prefers-reduced-motion`.
- Tema claro e escuro via `prefers-color-scheme`.
- Zero fonte remota ou CDN — a aplicação precisa funcionar offline, o que é
  requisito funcional, não preferência estética.

---

# 2. Contexto

No PJe (e demais sistemas do Judiciário brasileiro), documentos que já contêm
assinatura digital embarcada — CTPS Digital, extratos do gov.br, CNIS, laudos do
INSS, certidões emitidas por cartório — costumam ser rejeitados no momento do
peticionamento com erro de assinatura, porque o PJe tenta validar a assinatura
preexistente e falha, ou porque não aceita PDF com campo de assinatura já
preenchido. O contorno usado no dia a dia dos escritórios é reimprimir o arquivo
para PDF (impressora virtual do Chrome/Firefox), o que descarta a camada de
assinatura.

# 3. Objetivo

Ferramenta web pública, sem cadastro e sem login, onde o usuário faz upload de
arquivos, aciona a validação, vê o diagnóstico de cada arquivo e pode pedir a
correção automática dos que falharem.

# 4. Formatos aceitos

- PDF (`application/pdf`)
- MP3 (`audio/mpeg`)
- MP4 (`video/mp4`)

Validação de tipo por **magic number / bytes de cabeçalho**, nunca por extensão
nem pelo MIME do navegador, que são trivialmente forjáveis e frequentemente
errados.

# 5. Fluxo de uso

1. Usuário arrasta ou seleciona um ou mais arquivos.
2. A lista aparece imediatamente, cada arquivo em uma linha, com nome, tipo,
   tamanho e estado `Aguardando validação`. Nenhuma análise roda ainda.
3. Botão **Validar** fica habilitado. Sem arquivo na lista, o botão fica
   desabilitado com `aria-disabled` e rótulo explicativo.
4. Ao clicar em Validar, o sistema percorre os arquivos **um a um, em ordem de
   lista**, e a linha do arquivo em processamento no momento exibe sinalização
   visual de atividade e mensagem de texto descrevendo a etapa corrente.
5. Terminada cada linha, ela assume o estado final: verde (Apto) ou vermelho
   (Não apto), com os motivos listados.
6. Linhas vermelhas exibem o botão **Tentar corrigir**, quando a falha for
   corrigível.
7. Correção roda por arquivo, com o mesmo padrão de sinalização visual e
   mensagem por etapa.
8. Após a correção, o arquivo resultante é **revalidado do zero** pelos mesmos
   validadores. A linha assume novo estado conforme o resultado real.
9. Sucesso → botão **Baixar arquivo corrigido**. O arquivo original permanece
   intocado e disponível.
10. Botão **Limpar tudo** sempre visível quando houver arquivos na lista.

Processamento sequencial, não paralelo. Motivo: os motores de correção são
pesados em memória e CPU, e o paralelismo tornaria impossível cumprir o
requisito de evidenciar qual arquivo está sendo processado agora.

# 6. Estados da linha do arquivo

Modelar como máquina de estados explícita, em módulo próprio, com transições
válidas declaradas.

| Estado | Cor | Texto na linha |
|---|---|---|
| `aguardando` | neutro | "Aguardando validação" |
| `validando` | neutro + indicador de atividade | mensagem da etapa corrente |
| `apto` | verde | "Pronto para anexar ao PJe" |
| `inapto` | vermelho | resumo dos motivos |
| `corrigindo` | âmbar + indicador de atividade | mensagem da etapa corrente |
| `corrigido` | verde | "Corrigido — revalidado com sucesso" |
| `correcao_falhou` | vermelho | "Não foi possível corrigir automaticamente" + orientação manual |
| `nao_corrigivel` | vermelho | motivo + orientação manual |

Mensagens de etapa que devem aparecer na linha, textualmente:

- "Lendo o arquivo…"
- "Verificando o tipo do arquivo…"
- "Procurando assinatura digital…"
- "Verificando o formato PDF/A…"
- "Conferindo o tamanho…"
- "Carregando o motor de correção…" (primeira correção da sessão)
- "Removendo a assinatura…"
- "Convertendo para PDF/A…"
- "Comprimindo — tentativa 2 de 4…"
- "Revalidando o arquivo corrigido…"

O indicador de atividade deve ser acompanhado de `aria-live="polite"` na região
da linha, para que leitor de tela anuncie a mudança de etapa. Não usar
`aria-live="assertive"`, que interromperia a leitura a cada troca de mensagem.

# 7. Regras de validação

## 7.1 Regra 1 — Arquivo não pode possuir assinatura digital

Aplicável a PDF. Reprovado se qualquer condição abaixo for verdadeira:

- Catálogo com `/AcroForm` e `/SigFlags` diferente de 0 (1 = SignaturesExist,
  3 = SignaturesExist + AppendOnly).
- Campo de formulário com `/FT /Sig`, preenchido (`/V` presente) ou não. Campo
  vazio gera **aviso**, não erro.
- Dicionário de assinatura com `/ByteRange` e `/Contents`.
- `/Perms` com `/DocMDP` ou `/UR3`.

Retornar quantidade de campos encontrados e nome de cada um, quando disponível.

MP3 e MP4 não carregam assinatura PAdES/CAdES — regra sempre aprovada e não
exibida no checklist desses tipos.

## 7.2 Regra 2 — Arquivo não pode exceder 10 MB

- Limite: **10 × 1024 × 1024 = 10.485.760 bytes**.
- Constante única em `src/config/limites.ts`. Os tribunais divergem nesse teto e
  o valor precisa ser alterável em um só lugar.
- Exibir tamanho real e, se reprovado, o excedente.

## 7.3 Regra 3 — PDF deve estar em conformidade PDF/A

Aplicável exclusivamente a PDF.

**Atenção do implementador:** conformidade PDF/A não é flag booleana. Existe a
*declaração* (metadados XMP) e a *conformidade real* (auditoria de fontes,
espaços de cor, transparência, criptografia e dezenas de outros requisitos da
ISO 19005). Um arquivo pode declarar PDF/A-1b e violar a norma; outro pode ser
conforme e não declarar nada. Implementar os dois níveis abaixo e **nunca
afirmar ao usuário que o arquivo "é PDF/A válido"** — no máximo, que está
declarado como tal e passou nas verificações básicas.

### Nível 1 — Declaração (XMP)

No namespace `http://www.aiim.org/pdfa/ns/id/`:

- `pdfaid:part` → 1, 2, 3 ou 4
- `pdfaid:conformance` → A, B ou U

Ausência das duas → `PDFA_NAO_DECLARADO`. Presença → registrar em `pdfaParte` e
`pdfaConformidade` e seguir para o Nível 2.

### Nível 2 — Verificações estruturais

Executar sempre, inclusive quando houver declaração, para detectar declaração
falsa.

| Verificação | Código | Gravidade |
|---|---|---|
| Trailer com `/Encrypt` | `PDFA_CRIPTOGRAFADO` | erro |
| Sem `/OutputIntents` com subtipo `GTS_PDFA1` | `PDFA_SEM_OUTPUTINTENT` | erro |
| Fonte sem `/FontFile`, `/FontFile2` ou `/FontFile3` | `PDFA_FONTE_NAO_EMBUTIDA` | erro |
| `/JavaScript`, `/JS`, `/AA` ou `/OpenAction` com script | `PDFA_JAVASCRIPT` | erro |
| `/EmbeddedFiles` | `PDFA_ARQUIVO_EMBUTIDO` | erro se parte 1 ou 2, aviso se parte 3 |
| Transparência (`/SMask`, `/CA` ou `/ca` < 1, `/Group` com `/S /Transparency`) | `PDFA_TRANSPARENCIA` | erro se parte 1, ignorar nas demais |
| `/Launch`, `/GoToR` ou referência externa | `PDFA_REFERENCIA_EXTERNA` | erro |

Declaração presente + falha no Nível 2 → emitir também
`PDFA_DECLARACAO_INCONSISTENTE`.

### Configurabilidade

Em `src/config/limites.ts`:

- `pdfaObrigatorio: boolean`
- `pdfaGravidade: 'erro' | 'aviso'`
- `pdfaPartesAceitas: number[]`

A exigência de PDF/A varia entre tribunais e tipos de documento. Muitos aceitam
PDF comum sem objeção. Cravar a regra como erro fixo reprovaria arquivos que
passariam sem problema, o que é pior que não validar — treina o usuário a
ignorar o diagnóstico. Padrão de fábrica: `pdfaGravidade: 'aviso'`.

## 7.4 Conflito conhecido entre a Regra 1 e a Regra 3

Reimprimir o PDF pelo navegador resolve a Regra 1 e **quebra** a Regra 3: a
impressora virtual do Chrome e do Firefox não grava XMP de conformidade nem
`/OutputIntents`. Quando um mesmo arquivo falhar nas duas regras
simultaneamente, a interface **não deve** exibir as duas orientações soltas —
deve exibir um único fluxo encadeado de dois passos (reimprimir para remover a
assinatura, depois exportar como PDF/A pelo LibreOffice), sob pena de o usuário
entrar em loop entre os dois erros. Tratar isso como caso de teste, não como
detalhe de cópia.

# 8. Correção automática

## 8.1 Princípio central: uma passada, não três

As três correções (remover assinatura, converter para PDF/A, comprimir) são
executadas pelo **mesmo motor, em uma única passada de reescrita do PDF**, e não
como três operações encadeadas.

Motivo: as correções interferem umas nas outras. Converter para PDF/A depois de
comprimir pode reintroduzir violação da norma; comprimir depois de converter
pode destruir a conformidade recém-criada; remover assinatura por rasterização
inflaria o arquivo e agravaria o problema de tamanho. Reescrever o documento uma
vez, com todos os parâmetros simultâneos, elimina a ordem de operações como
fonte de bug.

Ghostscript em WebAssembly resolve os três casos em uma invocação:

```
-dPDFA=2 -dPDFACompatibilityPolicy=1
-sColorConversionStrategy=UseDeviceIndependentColor
-dPDFSETTINGS=/ebook
-sDEVICE=pdfwrite
```

A reescrita descarta a camada de assinatura como efeito colateral natural — não
é necessário instruir o usuário a imprimir manualmente, nem rasterizar páginas.

## 8.2 Correção por motivo

### `ASSINATURA_PRESENTE` / `RESTRICAO_DOCMDP`

Reescrever o PDF sem os dicionários de assinatura e sem `/Perms`, preservando a
camada de texto.

**Preservar o texto é requisito, não otimização.** A solução manual de imprimir
pelo navegador funciona, mas em parte dos casos rasteriza o conteúdo: o
documento deixa de ser pesquisável, cresce de tamanho e se torna ilegível para
leitor de tela. A correção automática não pode reproduzir esse defeito. Incluir
teste que extrai texto do arquivo corrigido e compara com o original.

Fallback, se o motor falhar: exibir a instrução manual (abrir no navegador,
Ctrl+P, "Salvar como PDF") como orientação textual.

### `PDFA_*` (qualquer código da Regra 3)

Converter para PDF/A-2b: embutir fontes, embutir perfil de cor sRGB como
`/OutputIntents`, gravar o XMP `pdfaid`, remover JavaScript e referências
externas.

Se o arquivo estiver criptografado (`PDFA_CRIPTOGRAFADO` ou
`ARQUIVO_CRIPTOGRAFADO`), a correção é **impossível sem a senha**. Estado
`nao_corrigivel`, com orientação para o usuário remover a proteção na origem.
Não pedir senha ao usuário nesta versão.

### `TAMANHO_EXCEDIDO`

Comprimir com alvo de tamanho, por tentativas sucessivas de qualidade
decrescente, no máximo 4 tentativas, parando na primeira que ficar abaixo do
limite:

1. `/ebook` (150 dpi)
2. `/ebook` com downsample para 120 dpi
3. `/screen` (72 dpi)
4. `/screen` com downsample para 60 dpi

Cada tentativa atualiza a mensagem da linha ("Comprimindo — tentativa 2 de 4…").
Se após a quarta tentativa o arquivo continuar acima do limite, estado
`correcao_falhou`, informando o menor tamanho alcançado e sugerindo dividir o
documento em partes.

Exibir, no resultado, o tamanho antes e depois, e **avisar quando a compressão
tiver reduzido a resolução das imagens** — documento digitalizado comprimido a
72 dpi pode ficar ilegível, e o usuário precisa conferir antes de protocolar.

### MP3 e MP4 acima do limite

Recodificar com `ffmpeg.wasm`, alvo de bitrate calculado a partir da duração e
do limite, com margem de 5%.

**Esta correção é a mais cara do projeto** — o módulo passa de 30 MB e a
recodificação de um vídeo de poucos minutos leva minutos no navegador. Portanto:

- Carregar `ffmpeg.wasm` apenas quando o usuário clicar em corrigir um arquivo
  de mídia, nunca antes.
- Antes de iniciar, exibir estimativa de tempo e pedir confirmação explícita.
- Exibir progresso percentual real, não indicador indeterminado.
- Oferecer botão de cancelar que efetivamente encerra o worker.

Se `ffmpeg.wasm` exigir `SharedArrayBuffer`, será necessário servir a aplicação
com `Cross-Origin-Opener-Policy: same-origin` e
`Cross-Origin-Embedder-Policy: require-corp`. Verificar isso **na fase de
planejamento**: a exigência afeta a escolha da hospedagem e pode quebrar outras
partes da página. Se inviável, usar o build single-thread, mais lento porém sem
exigência de cabeçalho.

Considerar aceitável entregar a Fase 2 sem correção de mídia, deixando apenas
orientação textual para MP3/MP4.

## 8.3 Regras invioláveis da correção

1. **Revalidação obrigatória.** O arquivo de saída passa pelos mesmos
   validadores, do zero. Ausência de exceção durante a correção não é evidência
   de sucesso.
2. **Nunca reportar sucesso falso.** Se a revalidação reprovar, o estado é
   `correcao_falhou`, mesmo que o motor tenha retornado código 0.
3. **Original preservado.** Jamais sobrescrever ou descartar o arquivo de
   entrada. O usuário deve poder baixar os dois.
4. **Nome de saída distinto.** `documento.pdf` → `documento-corrigido.pdf`.
5. **Aviso legal na primeira correção da sessão.** Texto curto, não modal
   bloqueante: a correção gera um documento novo, sem a assinatura digital
   original; confira o resultado antes de protocolar. Em geral isso não é
   problema, porque a autenticidade desses documentos é verificada pelo código
   ou QR code impresso na própria página, não pela assinatura embarcada — mas a
   conferência é responsabilidade do usuário.
6. **Timeout.** Toda correção tem limite de tempo configurável (padrão: 120 s
   para PDF). Estourou, aborta e informa.
7. **Sem rede.** Os módulos WASM são servidos pela própria origem, como assets
   estáticos versionados. Nenhum CDN de terceiro.

# 9. Ciclo de vida e descarte dos arquivos

Como nada sai do navegador, **não existe armazenamento para limpar**. Os
arquivos vivem apenas na memória da aba. "Descartar" aqui é soltar referência,
não apagar registro — e fechar a aba já elimina tudo. O trabalho real é impedir
que algo escape para um lugar persistente e liberar memória entre arquivos.

## 9.1 Proibições absolutas

Nenhum conteúdo de arquivo, nome de arquivo ou metadado de documento pode tocar
`localStorage`, `sessionStorage`, IndexedDB, Cache API, cookie, `document.title`,
`history.pushState` ou parâmetro de URL.

O service worker cacheia exclusivamente os assets da aplicação, com **allowlist
por caminho** — nunca por padrão genérico, senão um dia ele cacheia um blob.

## 9.2 Descarte por término de worker

Mecanismo principal, e o mais completo: terminar o worker libera de uma vez o
heap inteiro, incluindo a memória linear do WASM.

Isso importa mais do que parece: a memória linear do WebAssembly **só cresce,
nunca encolhe**. Reaproveitar a mesma instância do motor entre arquivos mantém
os bytes do documento anterior vivos até a aba fechar. Um worker novo por
arquivo custa alguns milissegundos de spawn e elimina o problema por construção.

```js
async function processar(file) {
  const worker = new Worker('/workers/pdf.js', { type: 'module' });
  try {
    const buffer = await file.arrayBuffer();
    return await enviar(worker, buffer, [buffer]); // transferência, não cópia
  } finally {
    worker.terminate(); // libera heap + memória WASM
  }
}
```

O array de transferência evita segunda cópia dos bytes: o buffer é transferido e
o original fica neutralizado no lado da UI.

## 9.3 Manter `File`, nunca `ArrayBuffer`

Na lista da interface, guardar o objeto `File` do input — referência preguiçosa
ao arquivo em disco, não os bytes carregados. Chamar `arrayBuffer()` apenas
dentro do worker, no momento do processamento. Assim um lote de 20 arquivos
ocupa quase nada até o usuário mandar validar.

## 9.4 Blob URLs precisam de revogação manual

Único vazamento que o navegador não resolve sozinho antes do unload. Registro
central com revogação garantida:

```js
const urls = new Map();

export function criarDownload(id, blob, nome) {
  descartar(id);
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return { url, nome };
}

export function descartar(id) {
  const url = urls.get(id);
  if (url) { URL.revokeObjectURL(url); urls.delete(id); }
}

export function descartarTudo() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}

addEventListener('pagehide', descartarTudo);
```

Revogar após o clique de download com atraso curto (~30 s) ou no `pagehide`.
Revogar imediatamente no `onclick` chega a cancelar o download em alguns
navegadores.

## 9.5 Gatilhos de descarte

- **Limpar tudo** — botão sempre visível quando houver arquivos; zera estado e
  chama `descartarTudo()`.
- **Descarte por linha** — `x` em cada arquivo.
- **Ociosidade** — timer de 30 minutos que limpa sozinho e exibe "os arquivos
  foram descartados por inatividade". Útil para o computador compartilhado do
  escritório onde alguém saiu para o almoço com a aba aberta.

## 9.6 O que dizer e o que não prometer

Dizer, perto da área de upload: os arquivos ficam apenas na memória do
navegador, não são enviados a lugar nenhum e desaparecem ao fechar a aba. Após o
download, informar que o arquivo corrigido está agora na pasta de downloads do
usuário — isso saiu da alçada da ferramenta e a interface não deve sugerir o
contrário.

**Não prometer apagamento seguro.** Sobrescrever memória com zeros é barato e não
faz mal, mas não garante nada: o coletor de lixo do JavaScript move objetos e
pode ter deixado cópias inalcançáveis. Se alguém perguntar, a resposta correta é
que o navegador não oferece essa garantia, e que a mitigação real é o dado nunca
ter saído da máquina.

# 10. Segurança e resistência a abuso

**Premissa que muda tudo: não há back-end.** Não existe endpoint, fila ou CPU do
projeto sendo consumida por requisição. Um bot que martele o site baixa arquivos
estáticos. Portanto **não implementar** rate limit por IP, CAPTCHA ou WAF de
aplicação — não há o que proteger, e CAPTCHA em particular seria dano puro:
quebra acessibilidade, atrapalha o usuário legítimo com pressa e não impede
nada, já que o processamento é local.

O esforço vai para quatro frentes.

## 10.1 Banda dos módulos WASM — o único custo real de abuso

Ghostscript e ffmpeg em WASM somam dezenas de MB. Script em loop ou hotlink de
terceiro vira fatura.

- Hospedar em plataforma com banda não medida para estático (Cloudflare Pages
  resolve). Se o provedor cobrar por GB, configurar **teto de gasto e alerta de
  orçamento** — sem isso o pior caso é ilimitado.
- Nome de arquivo com hash e `Cache-Control: public, max-age=31536000, immutable`.
- `Access-Control-Allow-Origin` restrito ao próprio domínio nos assets WASM,
  cortando hotlink.
- `Content-Security-Policy: frame-ancestors 'none'`.

## 10.2 Auto-DoS do navegador — o mais provável de acontecer

O travamento real não vem de atacante, vem do usuário arrastando 80 arquivos ou
um vídeo de 2 GB. Limites em `src/config/limites.ts`:

- máximo de arquivos por lote (padrão: 20)
- tamanho absoluto que a ferramenta se dispõe a ler (acima disso, rejeita sem
  tentar — arquivo de 2 GB reprova por tamanho de qualquer forma, não precisa
  carregar para saber)
- um worker por vez, correção sequencial, botão de cancelar que encerra o worker
  de fato
- timeout por operação
- descarte agressivo de buffers intermediários (seção 9)

## 10.3 Cadeia de dependências — o risco que realmente importa

Este é o ponto sério, e não é DoS. A ferramenta manipula CPF, vínculo
empregatício e laudo médico dentro do navegador. Uma dependência npm comprometida
teria acesso direto a esses documentos e poderia exfiltrá-los. O impacto é ordens
de grandeza acima de qualquer indisponibilidade.

O controle mais valioso do projeto é uma CSP restritiva, porque bloqueia a
exfiltração mesmo com dependência maliciosa em execução:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
connect-src 'self';
img-src 'self' blob: data:;
worker-src 'self' blob:;
object-src 'none';
frame-ancestors 'none';
base-uri 'none';
form-action 'none';
```

`connect-src 'self'` é a linha que importa: nenhum script consegue abrir conexão
para domínio externo.

Complementos: lockfile commitado, versões pinadas, `npm audit` bloqueante no CI,
Dependabot e — principalmente — **poucas dependências**. Cada pacote a mais é
superfície.

## 10.4 Integridade da distribuição

Ferramenta jurídica útil e gratuita é clonada rápido; o risco é alguém hospedar
cópia adulterada que envia os documentos para um servidor. Mitigação: domínio
próprio divulgado consistentemente, HTTPS com HSTS, código aberto e verificável,
e uma linha na interface informando qual é o endereço oficial.

## 10.5 Monitoramento

Se houver necessidade de saber se a ferramenta está sendo usada: contadores
agregados na borda (visitas, país, referrer). Nome de arquivo, tamanho, número de
páginas e códigos de erro por documento **não podem sair da máquina do usuário** —
são metadados de processo judicial e contaminam a promessa de privacidade que a
interface faz.

# 11. Requisitos não funcionais

**Privacidade é requisito de primeira ordem.** Os arquivos contêm CPF, endereço,
vínculos empregatícios, informações médicas e dados de terceiros.

- Todo o processamento, inclusive a correção, ocorre **no navegador**. Nenhum
  byte de arquivo trafega para servidor.
- Sem upload, sem persistência, sem log de conteúdo, sem telemetria contendo nome
  de arquivo ou metadados de documento.
- Interface declara isso de forma visível, com frase curta e verificável.
- A aplicação funciona offline após o primeiro carregamento, incluindo os módulos
  WASM, cacheados por service worker com allowlist.
- Análise e correção em Web Worker. A UI nunca trava.
- Responsivo, utilizável em celular — parte relevante do público peticiona do
  telefone.
- Acessível: navegação por teclado, `input[type=file]` real sob a área de drop,
  erros associados por `aria-describedby`, contraste adequado, foco visível,
  estados anunciados por `aria-live="polite"`.

# 12. Contrato de saída

```json
{
  "nomeArquivo": "ctps-digital.pdf",
  "tipoDetectado": "application/pdf",
  "tamanhoBytes": 2417265,
  "pdfaParte": null,
  "pdfaConformidade": null,
  "apto": false,
  "corrigivel": true,
  "ocorrencias": [
    {
      "codigo": "ASSINATURA_PRESENTE",
      "gravidade": "erro",
      "mensagem": "O documento contém 1 assinatura digital.",
      "detalheTecnico": "AcroForm.SigFlags=3; campo 'Signature1' com /ByteRange",
      "orientacao": "Podemos remover a assinatura automaticamente.",
      "correcaoDisponivel": "REMOVER_ASSINATURA"
    }
  ],
  "correcao": {
    "tentada": true,
    "estrategias": ["REMOVER_ASSINATURA", "CONVERTER_PDFA"],
    "sucesso": true,
    "tamanhoAntes": 2417265,
    "tamanhoDepois": 1980112,
    "textoPreservado": true,
    "avisos": [],
    "duracaoMs": 3412,
    "revalidacao": { "apto": true, "ocorrencias": [] }
  }
}
```

Códigos de ocorrência: `ASSINATURA_PRESENTE`, `CAMPO_ASSINATURA_VAZIO`,
`RESTRICAO_DOCMDP`, `TAMANHO_EXCEDIDO`, `FORMATO_NAO_SUPORTADO`,
`ARQUIVO_CRIPTOGRAFADO`, `ARQUIVO_CORROMPIDO`, `PDFA_NAO_DECLARADO`,
`PDFA_DECLARACAO_INCONSISTENTE`, `PDFA_CRIPTOGRAFADO`, `PDFA_SEM_OUTPUTINTENT`,
`PDFA_FONTE_NAO_EMBUTIDA`, `PDFA_JAVASCRIPT`, `PDFA_ARQUIVO_EMBUTIDO`,
`PDFA_TRANSPARENCIA`, `PDFA_REFERENCIA_EXTERNA`.

Estratégias de correção: `REMOVER_ASSINATURA`, `CONVERTER_PDFA`,
`COMPRIMIR_PDF`, `RECODIFICAR_MIDIA`.

# 13. Stack sugerida

- Front-end: React + TypeScript + Vite. Sem back-end.
- Análise de PDF: `pdf-lib` para estrutura, ou parser próprio do
  trailer/catálogo caso `pdf-lib` não exponha `SigFlags` diretamente. `pdf.js`
  como alternativa, já traz detecção de criptografia e `getMetadata()` para XMP.
- XMP: extrair o packet entre `<?xpacket begin=` e `<?xpacket end=` e parsear com
  `DOMParser`. Não adicionar biblioteca de XMP para ler duas propriedades.
- Correção de PDF: Ghostscript em WebAssembly (`gs-wasm`, `ghostscript-wasm`) ou
  `mupdf-wasm`. **Ver decisão bloqueante de licença na seção 1.3.**
- Correção de mídia: `ffmpeg.wasm`, carregado sob demanda.
- Detecção de tipo: primeiros bytes (`%PDF-`, `ID3`/`0xFFFB`, box `ftyp` no
  offset 4).
- Testes: Vitest. Fixtures geradas por script, nunca commitadas como binário
  opaco sem o gerador correspondente.
- Sem APIs externas de qualquer natureza — o que exclui, por decisão consciente,
  o veraPDF em modo serviço.

# 14. Critérios de aceite

Testes escritos **antes** da implementação, em ciclo red/green.

## 14.1 Validação

- PDF sem assinatura, 1 MB → apto.
- PDF sintético assinado com certificado autoassinado → `ASSINATURA_PRESENTE`.
- PDF com campo de assinatura vazio → aviso `CAMPO_ASSINATURA_VAZIO`, apto.
- PDF de 10.485.761 bytes → reprovado; de 10.485.760 bytes → aprovado.
- PDF protegido por senha → `ARQUIVO_CRIPTOGRAFADO`, `corrigivel: false`.
- `.exe` renomeado para `.pdf` → `FORMATO_NAO_SUPORTADO`.
- MP3 e MP4 válidos abaixo do limite → aptos, sem checklist de assinatura nem de
  PDF/A.
- MP4 de 50 MB → reprovado apenas por tamanho.
- Lote de 5 arquivos → 5 resultados independentes, nenhum contaminando o outro.
- PDF/A-1b → aprovado, `pdfaParte: 1`, `pdfaConformidade: "B"`.
- PDF/A-2b com transparência → aprovado, sem `PDFA_TRANSPARENCIA`.
- PDF declarando PDF/A-1b sem `/OutputIntents` →
  `PDFA_DECLARACAO_INCONSISTENTE` + `PDFA_SEM_OUTPUTINTENT`.
- PDF com fonte não embutida → `PDFA_FONTE_NAO_EMBUTIDA`.
- `pdfaObrigatorio: false` → nenhuma ocorrência da Regra 3.
- `pdfaGravidade: 'aviso'` → ocorrência presente, `apto: true`.

## 14.2 Fluxo e estados

- Lista vazia → botão Validar desabilitado.
- Durante a validação de um lote, em qualquer instante **exatamente uma** linha
  está em `validando`.
- Cada linha percorre `aguardando → validando → apto|inapto`. Transição inválida
  (ex.: `aguardando → corrigido`) lança erro em desenvolvimento.
- Falha catastrófica na análise de um arquivo não interrompe o lote: a linha vai
  para `inapto` com `ARQUIVO_CORROMPIDO` e o próximo arquivo é processado.
- Linha `apto` não exibe botão de correção.
- Linha `nao_corrigivel` não exibe botão de correção.
- Lote acima do máximo de arquivos → recusa com mensagem clara, sem travar.

## 14.3 Correção

- PDF assinado → corrigido → revalidação retorna `apto: true` e zero ocorrências
  de assinatura.
- **PDF assinado com texto extraível → após correção, o texto continua extraível
  e equivalente ao original.** Teste bloqueante.
- PDF não-PDF/A → corrigido → `pdfaParte` e `pdfaConformidade` preenchidos e
  Nível 2 sem erros.
- PDF de 25 MB com imagens → corrigido → abaixo de 10.485.760 bytes, com aviso de
  redução de resolução em `avisos`.
- PDF impossível de comprimir abaixo do limite em 4 tentativas →
  `correcao_falhou`, informando o menor tamanho alcançado.
- PDF assinado **e** não-PDF/A **e** acima do limite → **uma única** invocação do
  motor resolve os três; revalidação retorna apto. Verificar por espião na
  chamada do motor que ele foi invocado exatamente uma vez.
- Motor retorna código 0 mas produz arquivo que falha na revalidação →
  `correcao_falhou`. Teste com motor mockado. **Este é o teste mais importante da
  suíte**: garante que sucesso reportado corresponde a sucesso real.
- Correção que estoura o timeout → aborta, `correcao_falhou`, worker encerrado,
  sem vazamento de memória.
- Arquivo original permanece disponível para download após correção
  bem-sucedida.
- Nome do arquivo corrigido difere do original.

## 14.4 Descarte

- Após `descartarTudo()`, `localStorage`, `sessionStorage` e IndexedDB estão
  vazios e nenhuma entrada da Cache API contém blob.
- Nenhum worker permanece vivo após o fim do lote.
- `URL.revokeObjectURL` chamada uma vez por blob criado — verificar com espião
  sobre `createObjectURL`/`revokeObjectURL`.
- Processar 20 arquivos de 8 MB em sequência não faz a memória da aba crescer
  monotonicamente: medir no início e ao fim, com tolerância.
- Nenhum nome de arquivo aparece em `document.title`, na URL ou no `history`.
- Recarregar a página com F5 não restaura nenhum arquivo da sessão anterior.
- Timer de ociosidade dispara e limpa o estado.

## 14.5 Rede, bundle e cabeçalhos

- Build da Fase 1 não contém nenhum `fetch`, `XMLHttpRequest` ou `sendBeacon`
  para host externo. Verificar por análise estática do bundle.
- Na Fase 2, as únicas requisições permitidas são para assets da própria origem.
  Teste de integração com painel de rede confirma ausência de chamada a domínio
  de terceiro durante um ciclo completo.
- Bundle inicial da Fase 2 (antes de qualquer correção) não inclui os módulos
  WASM. Verificar por tamanho do chunk de entrada.
- Os cabeçalhos da seção 10 estão presentes na resposta do servidor estático, e a
  configuração está versionada no repositório.

# 15. Fora de escopo

Validação completa ISO 19005 (nível veraPDF), OCR, divisão de arquivos em partes,
remoção de senha de PDF criptografado, assinatura de documentos, qualquer
funcionalidade que exija back-end.

Manter validadores como funções puras
`(ArrayBuffer, metadados, config) => Ocorrencia[]`, registradas em um array, sem
acoplamento com a UI. Manter corretores como
`(ArrayBuffer, Ocorrencia[], config) => Promise<ResultadoCorrecao>`, igualmente
desacoplados, para que a troca do motor WASM não exija tocar em nenhuma outra
camada.

---

# 16. Complementos do planejamento (2026-08-28)

Observações levantadas ao converter esta spec em plano. Nenhuma altera
requisito; todas são decisões de implementação que os planos assumem.

## 16.1 Ambiente real de execução

O desenvolvimento ocorre no **Claude Code (VSCode) em Windows**, não no
Antigravity. Adaptações, sem perda de intenção:

- "Artifact / Agent Manager" → documentos Markdown versionados em `docs/`
  (`docs/superpowers/plans/`, `docs/decisoes/`, `docs/evidencias/`).
- "Browser agent" → **Playwright** (`@playwright/test`) dirigido localmente,
  **somente com fixtures sintéticas**. Screenshots e gravação vão para
  `docs/evidencias/`.
- Task list com estado → checkboxes nos próprios arquivos de plano.

## 16.2 Licença do motor (§1.3) — encaminhamento recomendado

A aplicação **já será open source** por decisão de §10.4 e §13 ("código aberto e
verificável"). Logo, a obrigação da AGPL de "abrir o código da aplicação
inteira" já está satisfeita por escolha do projeto. Caminho recomendado na
decisão da Fase 2: **publicar a aplicação sob AGPL-3.0** e manter o build do
Ghostscript-WASM como componente com atribuição própria. Alternativa permissiva
(qpdf/pdfcpu em WASM, Apache-2.0) **não faz conversão PDF/A** — adotá-la
obrigaria a abrir mão da correção automática da Regra 3. A decisão formal
continua sendo pré-requisito da Fase 2 (tarefa P2-0).

## 16.3 CSP e CSS

A CSP de §10.3 não declara `style-src`; com `default-src 'self'` isso proíbe
CSS-in-JS com injeção em runtime e `<style>` inline sem nonce. **Decisão:** usar
**CSS Modules / CSS plano** (Vite extrai para arquivo no build), sem
styled-components / emotion. Acrescentar à CSP publicada:
`style-src 'self'; manifest-src 'self'; frame-src 'none'`.

## 16.4 Detecção de criptografia via `pdf-lib`

`PDFDocument.load(bytes)` (sem `ignoreEncryption`) lança `EncryptedPDFError` em
PDF protegido — usar isso como sinal:

- `EncryptedPDFError` → `ARQUIVO_CRIPTOGRAFADO`, `corrigivel: false`.
- Qualquer outra exceção de parse → `ARQUIVO_CORROMPIDO`, `corrigivel: false`.

## 16.5 Extração de texto para o teste de preservação (§8.2, §14.3)

O teste bloqueante de preservação de texto usa **`pdfjs-dist`** apenas como
`devDependency` de teste (`page.getTextContent()`), não entra no bundle.

## 16.6 Detecção de tipo — precisão

- **MP4:** `ftyp` no offset 4 **e** major/compatible brand em allowlist
  (`isom`, `iso2`, `mp41`, `mp42`, `avc1`, `dash`). Rejeitar `qt  ` (MOV) e
  `M4A ` (áudio) como `FORMATO_NAO_SUPORTADO`.
- **MP3:** `ID3` no offset 0 **ou** frame sync `0xFF` seguido de `0xE?/0xF?` com
  nibble de bitrate válido (≠ `1111`).
- **PDF:** `%PDF-` nos primeiros 1024 bytes (alguns arquivos têm BOM/prefixo).

## 16.7 Teste de crescimento de memória (§14.4)

`performance.measureUserAgentSpecificMemory()` exige `crossOriginIsolated`
(COOP+COEP), que a Fase 1 não ativa. Esse assert específico roda só em Chromium
e com `test.skip` quando a API estiver ausente. As asserções primárias de §14.4
são **contagem de workers vivos = 0** e **contagem de `revokeObjectURL` por
blob**, que não dependem dessa API.

## 16.8 COOP/COEP e ffmpeg (§8.2, P2-1)

Preferência: **build single-thread do `ffmpeg.wasm`**, evitando o requisito de
`SharedArrayBuffer` e os cabeçalhos COOP/COEP que complicariam a hospedagem e o
carregamento de assets. Se o desempenho single-thread for inaceitável, a Fase 2
entrega MP3/MP4 **apenas com orientação textual** (permitido por §8.2). Decisão
registrada em P2-1.

## 16.9 Infra compartilhada construída na Fase 1

`blobRegistry` (§9.4) e o timer de ociosidade (§9.5) são construídos na Fase 1
mesmo o download só existindo na Fase 2 — são pré-requisito de "Limpar tudo",
descarte por linha e ociosidade, todos da Fase 1.
