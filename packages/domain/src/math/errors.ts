// This file performs unit math only. It does not advise on dose safety.
// The user is responsible for their own protocol.

/**
 * Thrown when a calculator input is structurally invalid (zero diluent,
 * unit mismatch, negative input, etc). Always surface to the user as a
 * fix-up, never as a silent fallback.
 */
export class MathError extends Error {
  override readonly name = 'MathError';
  readonly code: MathErrorCode;
  readonly context: Readonly<Record<string, unknown>>;

  constructor(code: MathErrorCode, message: string, context: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.context = Object.freeze({ ...context });
  }
}

export type MathErrorCode =
  | 'DIVISION_BY_ZERO'
  | 'NON_FINITE'
  | 'NEGATIVE_INPUT'
  | 'UNIT_MISMATCH'
  | 'CONCENTRATION_REQUIRED'
  | 'INVALID_DECIMAL'
  | 'EMPTY_INPUT';
