/**
 * Copia o build de Ghostscript-WASM (@jspawn/ghostscript-wasm) para
 * `public/motores/`, com o `.wasm` versionado por hash de conteúdo (spec §8.3.7),
 * e escreve `src/config/motores.ts` com o caminho. Roda no `prebuild` e no
 * `postinstall`. Se o pacote não estiver instalado, sai sem erro — a Fase 2
 * então opera em degradação graciosa.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM = join(RAIZ, 'node_modules', '@jspawn', 'ghostscript-wasm');
const DESTINO = join(RAIZ, 'public', 'motores');
const CONFIG = join(RAIZ, 'src', 'config', 'motores.ts');

const configVazio = `// GERADO por scripts/preparar-motor.ts — não editar à mão.
export const CAMINHO_MOTOR_GS: string | null = null;
`;

if (!existsSync(join(ORIGEM, 'gs.wasm'))) {
  writeFileSync(CONFIG, configVazio);
  console.log('preparar-motor: @jspawn/ghostscript-wasm ausente — motor desativado.');
  process.exit(0);
}

mkdirSync(DESTINO, { recursive: true });
// limpa .wasm antigos
for (const f of readdirSync(DESTINO)) {
  if (f.endsWith('.wasm')) rmSync(join(DESTINO, f));
}

const wasm = readFileSync(join(ORIGEM, 'gs.wasm'));
const hash = createHash('sha256').update(wasm).digest('hex').slice(0, 12);
const nomeWasm = `gs.${hash}.wasm`;

writeFileSync(join(DESTINO, nomeWasm), wasm);
for (const glue of ['gs.mjs', 'gs.js', 'browser.js']) {
  copyFileSync(join(ORIGEM, glue), join(DESTINO, glue));
}

writeFileSync(
  CONFIG,
  `// GERADO por scripts/preparar-motor.ts — não editar à mão.
export const CAMINHO_MOTOR_GS: string | null = '/motores/${nomeWasm}';
`,
);

console.log(`preparar-motor: ${nomeWasm} (${(wasm.length / 1024 / 1024).toFixed(1)} MB) + glue -> public/motores/`);
