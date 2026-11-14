import type { GuardViolation, InputCheck, InputCheckResult } from '../guardrail.types.js';

const MAX_URLS = 2;
const MAX_REPEATED_CHAR_RUN = 20;
const URL_PATTERN = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

export class SpamCheck implements InputCheck {
  readonly name = 'spam';

  run(text: string): InputCheckResult {
    const violations: GuardViolation[] = [];

    const urlCount = text.match(URL_PATTERN)?.length ?? 0;
    if (urlCount > MAX_URLS) {
      violations.push({
        check: this.name,
        code: 'SPAM_TOO_MANY_LINKS',
        message: 'Please remove the links and just describe the issue.',
        severity: 'block',
      });
    }

    if (new RegExp(`(.)\\1{${MAX_REPEATED_CHAR_RUN},}`).test(text)) {
      violations.push({
        check: this.name,
        code: 'SPAM_REPEATED_CHARACTERS',
        message: 'Your message looks like spam. Please describe the issue in normal text.',
        severity: 'block',
      });
    }

    // Same word making up most of a longer message, e.g. "help help help help …"
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length >= 10) {
      const counts = new Map<string, number>();
      for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
      const top = Math.max(...counts.values());
      if (top / words.length > 0.6) {
        violations.push({
          check: this.name,
          code: 'SPAM_REPEATED_WORDS',
          message: 'Your message looks like spam. Please describe the issue in normal text.',
          severity: 'block',
        });
      }
    }

    // Shouting isn't blocked — just flagged for logs
    const letters = text.replace(/[^a-zA-Z]/g, '');
    if (letters.length > 30 && letters === letters.toUpperCase()) {
      violations.push({ check: this.name, code: 'ALL_CAPS', message: 'All caps message', severity: 'warn' });
    }

    return { text, violations };
  }
}
