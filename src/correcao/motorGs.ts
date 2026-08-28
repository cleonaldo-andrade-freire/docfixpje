import type { MotorPdf, SaidaMotor } from './motor';
import { CAMINHO_MOTOR_GS } from '../config/motores';

/**
 * Adaptador do Ghostscript-WASM (@jspawn/ghostscript-wasm) para a interface
 * `MotorPdf`. Toda a especificidade do build fica aqui (spec §15).
 *
 * O glue Emscripten e o `.wasm` são servidos pela própria origem em
 * `/motores/` (copiados por `scripts/preparar-motor.ts`, versionados por hash).
 * Carregado só dentro do worker, sob demanda.
 */

type FabricaEmscripten = (config: Record<string, unknown>) => Promise<{
  callMain: (args: string[]) => number;
  FS: {
    writeFile: (caminho: string, dados: Uint8Array) => void;
    readFile: (caminho: string) => Uint8Array;
    unlink: (caminho: string) => void;
  };
}>;

let fabricaMemo: Promise<FabricaEmscripten> | null = null;

function urlGlue(): string {
  // Montada em runtime: o Vite dev não pode resolvê-la estaticamente (arquivos
  // de /public não podem ser importados como módulo do código-fonte).
  const origem =
    typeof self !== 'undefined' && self.location ? self.location.origin : '';
  return `${origem}/${['motores', 'gs.mjs'].join('/')}`;
}

async function carregarFabrica(): Promise<FabricaEmscripten> {
  if (!fabricaMemo) {
    fabricaMemo = (
      import(/* @vite-ignore */ urlGlue()) as Promise<{ default: FabricaEmscripten }>
    ).then((m) => m.default);
  }
  return fabricaMemo;
}

export async function criarMotorGs(): Promise<MotorPdf | null> {
  if (!CAMINHO_MOTOR_GS) return null;
  try {
    await carregarFabrica();
  } catch {
    return null;
  }

  return {
    async executar(entrada: Uint8Array, args: string[]): Promise<SaidaMotor> {
      const gs = await carregarFabrica();
      const stderr: string[] = [];
      let codigo = 0;

      const mod = await gs({
        noInitialRun: true,
        print: () => {},
        printErr: (s: string) => stderr.push(s),
        locateFile: (p: string) => (p.endsWith('.wasm') ? CAMINHO_MOTOR_GS : p),
      });

      mod.FS.writeFile('/entrada.pdf', entrada);
      try {
        codigo = mod.callMain(args) ?? 0;
      } catch (e) {
        const status = (e as { status?: number }).status;
        codigo = typeof status === 'number' ? status : 1;
      }

      let bytes: Uint8Array | null = null;
      try {
        bytes = mod.FS.readFile('/saida.pdf');
      } catch {
        bytes = null;
      }

      return { codigo, bytes, log: stderr.join('\n') };
    },
  };
}
