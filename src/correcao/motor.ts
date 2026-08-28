/**
 * Contrato do motor de reescrita de PDF (spec §8, §15).
 *
 * O motor é INJETÁVEL: nem o `corrigirPdf` nem a UI conhecem a implementação
 * concreta. Trocar o motor (Ghostscript-WASM, MuPDF-WASM, um build de fonte…)
 * não toca em nenhuma outra camada.
 *
 * `criarMotorReal()` carrega o Ghostscript-WASM (@jspawn/ghostscript-wasm) via
 * `motorGs.ts`. Se o build não estiver disponível ou falhar ao instanciar,
 * `carregarMotor()` lança `MotorIndisponivel` e a camada acima degrada para
 * `correcao_falhou` + instrução manual (fallback previsto em §8.2). Trocar de
 * motor é trocar `motorGs.ts` — nada mais (spec §15).
 */

export interface SaidaMotor {
  /** Código de saída do motor. 0 não é garantia de sucesso (spec §8.3.2). */
  codigo: number;
  /** Bytes do PDF reescrito, ou null se o motor não produziu saída. */
  bytes: Uint8Array | null;
  /** Diagnóstico do motor (stderr), para o detalhe técnico. */
  log: string;
}

export interface MotorPdf {
  /**
   * Reescreve `entrada` aplicando `args` (linha de comando estilo Ghostscript).
   * Uma única invocação resolve remover assinatura + PDF/A + compressão (§8.1).
   */
  executar(entrada: Uint8Array, args: string[]): Promise<SaidaMotor>;
}

export class MotorIndisponivel extends Error {
  readonly name = 'MotorIndisponivel';
  constructor(motivo = 'nenhum motor de correção está disponível nesta instalação') {
    super(motivo);
  }
}

let motorMemo: Promise<MotorPdf> | null = null;
let motorTeste: MotorPdf | null = null;
let carregado = false;

/** Substitui o motor por um dublê determinístico nos testes. */
export function __setMotorParaTeste(motor: MotorPdf | null): void {
  motorTeste = motor;
  motorMemo = null;
  carregado = motor !== null;
}

/** true quando o motor já foi instanciado nesta sessão (etapa "Carregando…"). */
export function motorJaCarregado(): boolean {
  return carregado;
}

/**
 * Ponto de integração do motor real (spec §15). Carrega o adaptador do
 * Ghostscript-WASM sob demanda; se o build não estiver disponível
 * (`CAMINHO_MOTOR_GS` nulo) ou falhar ao instanciar, retorna null e a Fase 2
 * opera em degradação graciosa.
 */
async function criarMotorReal(): Promise<MotorPdf | null> {
  try {
    const { criarMotorGs } = await import('./motorGs');
    return await criarMotorGs();
  } catch {
    return null;
  }
}

/** Carrega (uma vez por sessão) o motor. Lança `MotorIndisponivel` se não houver. */
export async function carregarMotor(onProgresso?: (frac: number) => void): Promise<MotorPdf> {
  if (motorTeste) {
    carregado = true;
    return motorTeste;
  }
  if (!motorMemo) {
    motorMemo = (async () => {
      onProgresso?.(0);
      const m = await criarMotorReal();
      onProgresso?.(1);
      carregado = true;
      if (!m) throw new MotorIndisponivel();
      return m;
    })();
  }
  return motorMemo;
}
