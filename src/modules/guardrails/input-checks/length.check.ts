import type { InputCheck, InputCheckResult } from '../guardrail.types.js';

export const MAX_MESSAGE_LENGTH = 2000;

export class LengthCheck implements InputCheck {
  readonly name = 'length';

  run(text: string): InputCheckResult {
    if (text.length === 0) {
      return {
        text,
        violations: [
          { check: this.name, code: 'INPUT_EMPTY', message: 'Please type a message.', severity: 'block' },
        ],
      };
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      return {
        text,
        violations: [
          {
            check: this.name,
            code: 'INPUT_TOO_LONG',
            message: `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.`,
            severity: 'block',
          },
        ],
      };
    }
    return { text, violations: [] };
  }
}
