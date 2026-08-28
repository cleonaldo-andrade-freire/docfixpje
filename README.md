# Validador de arquivos para o PJe

Ferramenta web pública, sem cadastro, que verifica se um **PDF, MP3 ou MP4** está
pronto para anexar a uma petição no PJe — **assinatura digital embarcada**,
**tamanho** e **conformidade PDF/A** — e, na Fase 2, corrige automaticamente os
que falharem. Todo o processamento acontece **no navegador**: nenhum byte de
arquivo sai da máquina.

> **Por que existe:** documentos com assinatura digital (CTPS Digital, extratos
> do gov.br, CNIS, laudos do INSS, certidões de cartório) costumam ser
> rejeitados no peticionamento. O contorno manual — reimprimir o PDF pelo
> navegador — descarta a assinatura mas quebra o PDF/A. Esta ferramenta
> diagnostica e orienta (Fase 1) e vai automatizar a correção (Fase 2).

## Status

- **Fase 1 — Validação:** completa. Upload, botão Validar, processamento visível
  por arquivo, diagnóstico verde/vermelho, orientação textual de correção
  manual, descarte, service worker offline, cabeçalhos de segurança.
- **Fase 2 — Correção automática:** não iniciada. Depende de duas decisões
  registradas como artefato (licença do motor WASM; COOP/COEP). Ver
  `docs/superpowers/plans/2026-08-28-validador-pje-fase2.md`.

## Rodar

```bash
npm install
npm run fixtures
npm run dev
```

Detalhes de teste, configuração e deploy: **`docs/walkthrough-fase1.md`**.
Especificação completa: **`docs/spec/2026-08-28-validador-pje-especificacao.md`**.

## Privacidade

Nenhum upload, nenhuma persistência, nenhuma telemetria com conteúdo ou
metadados de documento. A aplicação funciona offline após o primeiro
carregamento. A CSP (`connect-src 'self'`) bloqueia qualquer conexão externa
mesmo que uma dependência seja comprometida.

## Licença

A definir junto com a decisão de licença do motor de correção (Fase 2, tarefa
P2-0). A intenção é **código aberto e verificável** (spec §10.4).
