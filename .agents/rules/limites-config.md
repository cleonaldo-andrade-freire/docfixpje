# Limites e configuração

Nenhum limite numérico literal fora de `src/config/limites.ts` (e, na Fase 2,
`src/config/motores.ts` para caminhos de assets do motor). Tamanhos, timeouts,
número de tentativas, máximo de arquivos por lote, limiares — tudo é constante
nomeada nesses arquivos. Testes que precisam de um número derivam da constante,
nunca repetem o literal.
