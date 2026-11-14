import { Logger } from '@nestjs/common';
import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { ChatGroq } from '@langchain/groq';
import type { ZodType } from 'zod';
import { ProviderError } from '../../common/errors/provider.error.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type {
  LlmChatOptions,
  LlmChatResult,
  LlmMessage,
  LlmProvider,
  LlmToolCall,
} from '../../ports/llm.provider.js';

/** Groq implementation of LlmProvider. All Groq/LangChain types stay inside this file. */
export class GroqLlmAdapter implements LlmProvider {
  readonly name = 'groq';
  private readonly logger = new Logger(GroqLlmAdapter.name);

  constructor(private readonly config: AppConfigService) {}

  async chat(messages: LlmMessage[], options: LlmChatOptions = {}): Promise<LlmChatResult> {
    try {
      const model = this.createModel(options);
      const runnable = options.tools?.length
        ? model.bindTools(
            options.tools.map((t) => ({ name: t.name, description: t.description, schema: t.schema })),
          )
        : model;

      const response = await runnable.invoke(this.toLangChain(messages));

      return {
        content: this.textOf(response.content),
        toolCalls: (response.tool_calls ?? []).map(
          (tc): LlmToolCall => ({
            id: tc.id ?? crypto.randomUUID(),
            name: tc.name,
            args: tc.args,
          }),
        ),
        usage: response.usage_metadata
          ? {
              inputTokens: response.usage_metadata.input_tokens,
              outputTokens: response.usage_metadata.output_tokens,
            }
          : undefined,
      };
    } catch (err) {
      throw new ProviderError(this.name, 'chat', err);
    }
  }

  async generateStructured<T>(
    messages: LlmMessage[],
    schema: ZodType<T>,
    options: Omit<LlmChatOptions, 'tools'> = {},
  ): Promise<T> {
    try {
      const model = this.createModel({ temperature: 0, ...options });
      // LangChain's typings for zod v4 schemas are loose; we re-validate below anyway
      const structured = model.withStructuredOutput(schema as never);
      const raw: unknown = await structured.invoke(this.toLangChain(messages));
      return schema.parse(raw);
    } catch (err) {
      throw new ProviderError(this.name, 'generateStructured', err);
    }
  }

  private createModel(options: Omit<LlmChatOptions, 'tools'>): ChatGroq {
    const { apiKey, model } = this.config.groq;
    return new ChatGroq({
      apiKey,
      model,
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens,
    });
  }

  private toLangChain(messages: LlmMessage[]): BaseMessage[] {
    return messages.map((m) => {
      switch (m.role) {
        case 'system':
          return new SystemMessage(m.content);
        case 'user':
          return new HumanMessage(m.content);
        case 'assistant':
          return new AIMessage({
            content: m.content,
            tool_calls: (m.toolCalls ?? []).map((tc) => ({ id: tc.id, name: tc.name, args: tc.args })),
          });
        case 'tool':
          if (!m.toolCallId) {
            this.logger.warn('Tool message without toolCallId');
          }
          return new ToolMessage({ content: m.content, tool_call_id: m.toolCallId ?? '' });
      }
    });
  }

  private textOf(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((part) => (typeof part === 'string' ? part : ((part as { text?: string }).text ?? '')))
        .join('');
    }
    return '';
  }
}
