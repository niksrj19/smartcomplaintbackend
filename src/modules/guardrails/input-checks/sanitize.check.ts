import type { InputCheck, InputCheckResult } from '../guardrail.types.js';

// Zero-width and bidi-override characters are a common way to hide injected instructions
const INVISIBLE_CHARS = /[​-‏‪-‮⁠-⁤﻿]/g;
// Control characters except tab, newline and carriage return
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Runs first: normalises the text so later checks can't be bypassed with look-alike characters. */
export class SanitizeCheck implements InputCheck {
  readonly name = 'sanitize';

  run(text: string): InputCheckResult {
    const cleaned = text
      .normalize('NFKC')
      .replace(INVISIBLE_CHARS, '')
      .replace(CONTROL_CHARS, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { text: cleaned, violations: [] };
  }
}
