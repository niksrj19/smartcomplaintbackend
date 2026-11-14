import { Inject, Injectable, Logger } from '@nestjs/common';
import { GuardrailViolationError } from './guardrail.errors.js';
import {
  INPUT_CHECKS,
  type GuardViolation,
  type InputCheck,
  type InputGuardResult,
} from './guardrail.types.js';

/**
 * Runs every user message through an ordered pipeline of checks before it reaches the LLM.
 * Each check can clean the text for the next one; any "block" violation stops the message.
 */
@Injectable()
export class InputGuardService {
  private readonly logger = new Logger(InputGuardService.name);

  constructor(@Inject(INPUT_CHECKS) private readonly checks: InputCheck[]) {}

  async check(rawText: string): Promise<InputGuardResult> {
    let text = rawText;
    const violations: GuardViolation[] = [];

    for (const check of this.checks) {
      const result = await check.run(text);
      text = result.text;
      violations.push(...result.violations);
      // Stop at the first blocking check — no need to run the rest
      if (result.violations.some((v) => v.severity === 'block')) break;
    }

    const allowed = !violations.some((v) => v.severity === 'block');
    if (violations.length > 0) {
      // Log codes only — never the citizen's full message
      this.logger.warn(
        `Input ${allowed ? 'flagged' : 'blocked'}: ${violations.map((v) => v.code).join(', ')}`,
      );
    }
    return { allowed, text, violations };
  }

  /** Returns the cleaned text, or throws GuardrailViolationError if blocked. */
  async assertAllowed(rawText: string): Promise<string> {
    const result = await this.check(rawText);
    if (!result.allowed) {
      throw new GuardrailViolationError('input', result.violations);
    }
    return result.text;
  }
}
