import { Injectable, Logger } from '@nestjs/common';
import type { ZodType } from 'zod';
import { GuardrailViolationError } from './guardrail.errors.js';
import type { GenerateWithRetryOptions, OutputRule, OutputValidation } from './guardrail.types.js';

const MAX_REPLY_LENGTH = 4000;

/** Phrases that suggest the model is leaking its instructions */
const LEAK_PATTERNS = [/\bsystem prompt\b/i, /\bmy instructions (are|say)\b/i, /<\/?(system|instructions)>/i];

/**
 * Nothing the LLM produces reaches the database or the user without passing through here.
 *  - Structured output (drafts, tool args): JSON parse → Zod schema → business rules → retry with feedback
 *  - Free-text replies: strip HTML, cap length, block instruction leaks
 */
@Injectable()
export class OutputGuardService {
  private readonly logger = new Logger(OutputGuardService.name);

  /** Accepts an object or a string (handles ```json fences and text around the JSON). */
  parseJson(raw: unknown): unknown {
    if (typeof raw !== 'string') return raw;
    const unfenced = raw.replace(/```(?:json)?/gi, '').trim();
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new SyntaxError('No JSON object found in model output');
    }
    return JSON.parse(unfenced.slice(start, end + 1));
  }

  async validate<T>(raw: unknown, schema: ZodType<T>, rules: OutputRule<T>[] = []): Promise<OutputValidation<T>> {
    let parsed: unknown;
    try {
      parsed = this.stripNulls(this.parseJson(raw));
    } catch (err) {
      return { ok: false, errors: [`Output is not valid JSON: ${(err as Error).message}`] };
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false,
        errors: result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
      };
    }

    const ruleErrors: string[] = [];
    for (const rule of rules) {
      const error = await rule.check(result.data);
      if (error) ruleErrors.push(`${rule.name}: ${error}`);
    }
    return ruleErrors.length ? { ok: false, errors: ruleErrors } : { ok: true, data: result.data };
  }

  /**
   * Calls the LLM, validates, and on failure retries with the errors as feedback
   * ("self-correction"). Throws GuardrailViolationError if every attempt fails.
   */
  async generateWithRetry<T>({
    schema,
    rules = [],
    maxAttempts = 2,
    generate,
  }: GenerateWithRetryOptions<T>): Promise<T> {
    let feedback: string | undefined;
    let lastErrors: string[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let raw: unknown;
      try {
        raw = await generate(feedback);
      } catch (err) {
        // The adapter may itself reject malformed output — treat that like a validation failure
        lastErrors = [(err as Error).message];
        feedback = this.buildFeedback(lastErrors);
        this.logger.warn(`Attempt ${attempt}/${maxAttempts} failed: ${lastErrors[0]}`);
        continue;
      }

      const result = await this.validate(raw, schema, rules);
      if (result.ok) {
        if (attempt > 1) this.logger.log(`Output fixed on attempt ${attempt}`);
        return result.data;
      }
      lastErrors = result.errors;
      feedback = this.buildFeedback(result.errors);
      this.logger.warn(`Attempt ${attempt}/${maxAttempts} invalid: ${result.errors.join('; ')}`);
    }

    this.logger.error(`Output still invalid after ${maxAttempts} attempts: ${lastErrors.join('; ')}`);
    throw new GuardrailViolationError('output', [
      {
        check: 'output-schema',
        code: 'OUTPUT_INVALID',
        message: 'Sorry, something went wrong preparing your complaint. Please try again.',
        severity: 'block',
      },
    ]);
  }

  /** For free-text chat replies shown to the citizen. */
  sanitizeReply(text: string): string {
    const leaked = LEAK_PATTERNS.some((p) => p.test(text));
    if (leaked) {
      this.logger.warn('Blocked a reply that looked like an instruction leak');
      return "I'm here to help you register or track a civic complaint. What issue would you like to report?";
    }
    const cleaned = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    return cleaned.length > MAX_REPLY_LENGTH ? `${cleaned.slice(0, MAX_REPLY_LENGTH)}…` : cleaned;
  }

  private buildFeedback(errors: string[]): string {
    return [
      'Your previous output was invalid. Fix these problems and respond again with only the corrected JSON:',
      ...errors.map((e) => `- ${e}`),
    ].join('\n');
  }

  /** Models often send `null` for missing optional fields; Zod's .optional() expects them absent. */
  private stripNulls(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => this.stripNulls(v));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== null)
          .map(([k, v]) => [k, this.stripNulls(v)]),
      );
    }
    return value;
  }
}
