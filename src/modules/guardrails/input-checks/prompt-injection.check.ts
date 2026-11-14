import type { InputCheck, InputCheckResult } from '../guardrail.types.js';

/**
 * Heuristic first line of defence against prompt injection.
 * The system prompt and tool validation are the second and third lines —
 * this check alone is never relied on.
 */
const INJECTION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(ignore|disregard|forget|override)\b.{0,30}\b(previous|prior|above|all|earlier|system)\b.{0,20}\b(instructions?|prompts?|rules?|guidelines?)\b/i, label: 'ignore-instructions' },
  { pattern: /\b(reveal|show|print|repeat|leak|output)\b.{0,30}\b(system|hidden|initial|original)\b.{0,15}\b(prompt|instructions?|message)\b/i, label: 'prompt-extraction' },
  { pattern: /\byou are (now|no longer)\b/i, label: 'role-override' },
  { pattern: /\b(act|pretend|behave)\s+as\s+(if\s+you\s+are\s+)?(an?\s+)?(different|unrestricted|unfiltered|evil|jailbroken)\b/i, label: 'role-override' },
  { pattern: /\b(jailbreak|DAN mode|developer mode|god mode)\b/i, label: 'jailbreak' },
  { pattern: /<\/?\s*(system|assistant|instructions?)\s*>/i, label: 'fake-role-tag' },
  { pattern: /^\s*(system|assistant)\s*:/im, label: 'fake-role-prefix' },
  { pattern: /\b(call|invoke|run|execute)\b.{0,20}\b(submit_complaint|create_draft|tool|function)\b/i, label: 'tool-coercion' },
];

export class PromptInjectionCheck implements InputCheck {
  readonly name = 'prompt-injection';

  run(text: string): InputCheckResult {
    const hit = INJECTION_PATTERNS.find(({ pattern }) => pattern.test(text));
    if (!hit) return { text, violations: [] };

    return {
      text,
      violations: [
        {
          check: this.name,
          code: `PROMPT_INJECTION_${hit.label.toUpperCase().replace(/-/g, '_')}`,
          message: "I can only help with registering and tracking civic complaints. Please describe the issue you're facing.",
          severity: 'block',
        },
      ],
    };
  }
}
