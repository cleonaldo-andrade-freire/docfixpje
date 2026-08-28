# Deploy na Vercel

A aplicação é 100% estática (Vite → `dist/`). Sem serverless functions, sem
back-end. O `vercel.json` na raiz já traz build, output e os cabeçalhos de
segurança (a Vercel **não** lê `public/_headers`).

## Antes do primeiro deploy

1. **Endereço oficial.** Edite `src/config/limites.ts` →
   `ENDERECO_OFICIAL` para o domínio que vai usar (ex.:
   `https://docfixpje.vercel.app` ou o domínio próprio). É exibido na interface
   (spec §10.4). Commit + push.

## Deploy pelo painel (recomendado)

1. https://vercel.com → **Add New… → Project** → importe
   `cleonaldo-andrade-freire/docfixpje`.
2. **Framework Preset:** `Vite` (autodetectado). Build/Output vêm do
   `vercel.json` — não mude nada.
3. **Node.js Version:** 22.x (Project Settings → General). O `package.json` já
   declara `engines.node >=22.12`.
4. **Deploy.** O que acontece no build:
   - `npm install` → `postinstall` roda `scripts/preparar-motor.ts`, que copia
     o Ghostscript-WASM (`gs.<hash>.wasm`, ~15 MB) + o glue de
     `node_modules/@jspawn/ghostscript-wasm` para `public/motores/` e gera
     `src/config/motores.ts`.
   - `npm run build` → `prebuild` roda o mesmo script de novo (idempotente),
     depois `tsc --noEmit && vite build`. `dist/motores/` sai com o `.wasm`.
5. Pronto. URL `https://<projeto>.vercel.app`.

## Deploy pela CLI (alternativa)

```bash
npm i -g vercel
vercel            # primeira vez: cria/liga o projeto
vercel --prod     # publica em produção
```

## Verificação pós-deploy

```bash
# cabeçalhos
curl -sI https://<seu-dominio>/ | grep -iE 'content-security-policy|strict-transport|x-content-type|referrer-policy'

# o .wasm é servido pela própria origem, imutável
curl -sI https://<seu-dominio>/motores/ | head -1
```

Na interface:
- Suba a fixture `assinado.pdf` (ou qualquer PDF assinado) → **Validar** →
  **Tentar corrigir** → deve virar "Corrigido — revalidado com sucesso" com o
  botão de baixar. Isso confirma que o Ghostscript-WASM carregou.
- Recarregue offline (DevTools → Network → Offline → F5): a página abre
  (service worker).
- DevTools → Network durante um ciclo: nenhuma requisição a domínio de
  terceiro.

## Observações

- **`connect-src 'self'`** na CSP: o `.wasm` e o glue são same-origin, então
  não precisam de exceção. Nada de CDN.
- **Custo de banda (spec §10.1):** o `.wasm` de ~15 MB baixa uma vez por
  visitante (cache `immutable`). No plano Hobby (100 GB/mês) são ~6.500
  primeiras visitas/mês. Se crescer, migrar assets estáticos para um provedor
  de banda não medida (Cloudflare Pages) ou configurar alerta de orçamento.
- **`dist/_headers`** é gerado (vem de `public/`) e fica inerte na Vercel —
  pode ignorar. É útil se algum dia publicar também no Cloudflare Pages.
- **Domínio próprio:** Project Settings → Domains. Depois de apontar, atualize
  `ENDERECO_OFICIAL` de novo.
- Se o `postinstall` falhar por algum motivo, o app **não quebra**: o motor
  fica indisponível e "Tentar corrigir" cai em `correcao_falhou` + instrução
  manual. A validação continua 100%.
