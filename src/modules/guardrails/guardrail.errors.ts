import type { GuardViolation } from './guardrail.types.js';

/** Thrown when input is blocked or LLM output can't be made valid. */
export class GuardrailViolationError extends Error {
  constructor(
    readonly stage: 'input' | 'output',
    readonly violations: GuardViolation[],
  ) {
    super(`Guardrail blocked ${stage}: ${violations.map((v) => v.code).join(', ')}`);
    this.name = 'GuardrailViolationError';
  }

  /** First blocking message — safe to show in the chat */
  get userMessage(): string {
    return (
      this.violations.find((v) => v.severity === 'block')?.message ??
      'Sorry, I could not process that message. Please try rephrasing it.'
    );
  }
}
