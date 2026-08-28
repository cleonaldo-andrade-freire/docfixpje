# Correção honesta

Nenhuma correção pode ser reportada como bem-sucedida sem revalidação do
arquivo de saída pelos mesmos validadores. É proibido presumir sucesso a partir
da ausência de exceção. O campo `sucesso` de `ResultadoCorrecao` é sempre
função de `revalidacao.apto` (e, para PDF assinado, de `textoPreservado`),
nunca do código de retorno do motor.
