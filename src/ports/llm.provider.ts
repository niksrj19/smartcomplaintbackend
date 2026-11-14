// Port interface — implemented by an adapter in src/adapters
import type { ZodType } from 'zod';

/** Injection token — services inject this, never a concrete adapter. */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

export type LlmRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LlmMessage {
  role: LlmRole;
  content: string;
  /** Set on assistant messages that requested tools */
  toolCalls?: LlmToolCall[];
  /** Set on tool messages: which tool call this result answers */
  toolCallId?: string;
}

export interface LlmToolDefinition {
  name: string;
  description: string;
  /** Zod object schema describing the tool's arguments */
  schema: ZodType;
}

export interface LlmChatOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: LlmToolDefinition[];
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmChatResult {
  content: string;
  toolCalls: LlmToolCall[];
  usage?: LlmUsage;
}

/**
 * Vendor-neutral LLM contract. Groq today; OpenAI/Gemini/etc. tomorrow
 * by adding an adapter and changing LLM_PROVIDER in .env.
 */
export interface LlmProvider {
  readonly name: string;
  chat(messages: LlmMessage[], options?: LlmChatOptions): Promise<LlmChatResult>;
  /** Returns JSON matching the schema (still re-checked by the output guardrail). */
  generateStructured<T>(
    messages: LlmMessage[],
    schema: ZodType<T>,
    options?: Omit<LlmChatOptions, 'tools'>,
  ): Promise<T>;
}
