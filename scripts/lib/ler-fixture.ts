import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');

/**
 * Lê uma fixture já gerada em `fixtures/` (rode `npm run fixtures` antes).
 * Preferir isto a chamar `gerarTodas()` nos testes: evita repetir a geração
 * (inclui keygen RSA) e o consumo de memória em cada arquivo de teste.
 */
export function lerFixture(nome: string): Uint8Array<ArrayBuffer> {
  const dados = readFileSync(join(DIR, nome));
  const out = new Uint8Array(dados.byteLength);
  out.set(dados);
  return out;
}
