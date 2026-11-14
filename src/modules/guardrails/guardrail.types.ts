export type GuardSeverity = 'block' | 'warn';

export interface GuardViolation {
  /** Which check raised it, e.g. "prompt-injection" */
  check: string;
  /** Stable machine-readable code, e.g. "INPUT_TOO_LONG" */
  code: string;
  /** Safe to show to the citizen */
  message: string;
  severity: GuardSeverity;
}

// ─── Input side ───

export interface InputCheckResult {
  /** Checks may clean the text (e.g. strip invisible characters) for the next check */
  text: string;
  violations: GuardViolation[];
}

/** One rule in the input pipeline. Add a new rule = add a class + register it. */
export interface InputCheck {
  readonly name: string;
  run(text: string): InputCheckResult | Promise<InputCheckResult>;
}

export interface InputGuardResult {
  allowed: boolean;
  /** The cleaned text to pass on to the LLM */
  text: string;
  violations: GuardViolation[];
}

// ─── Output side ───

/** A business rule on top of the Zod schema. Return an error message, or null if fine. */
export interface OutputRule<T> {
  readonly name: string;
  check(data: T): string | null | Promise<string | null>;
}

export type OutputValidation<T> = { ok: true; data: T } | { ok: false; errors: string[] };

export interface GenerateWithRetryOptions<T> {
  schema: import('zod').ZodType<T>;
  rules?: OutputRule<T>[];
  /** Total LLM attempts, including the first. Default 2. */
  maxAttempts?: number;
  /**
   * Calls the LLM. On a retry, `feedback` describes what was wrong,
   * so the caller can append it to the conversation.
   */
  generate: (feedback?: string) => Promise<unknown>;
}

export const INPUT_CHECKS = Symbol('INPUT_CHECKS');
