/**
 * Adapters wrap every vendor error (Groq, Gemini, Redis, Kafka, R2) in this class,
 * so the rest of the app never depends on a vendor's error types.
 */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly operation: string,
    readonly cause?: unknown,
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause ?? 'unknown error');
    super(`[${provider}] ${operation} failed: ${reason}`);
    this.name = 'ProviderError';
  }
}
