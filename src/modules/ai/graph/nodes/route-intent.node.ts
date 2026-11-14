import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { LLM_PROVIDER, type LlmProvider } from '../../../../ports/llm.provider.js';
import type { Intent } from '../../agent.types.js';
import { ROUTER_PROMPT } from '../../prompts/agent.prompts.js';
import { type AgentStateType, type AgentStateUpdate, recentMessages } from '../agent.state.js';

const intentSchema = z.object({
  intent: z.enum(['new_complaint', 'status_check', 'general', 'off_topic']),
});

export const TICKET_PATTERN = /\bSC-\d{4}-\d{5}\b/i;

/** Node 2 — decides which branch handles this message. */
@Injectable()
export class RouteIntentNode {
  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  async run(state: AgentStateType): Promise<AgentStateUpdate> {
    const latest = state.messages.at(-1)?.content ?? '';

    // Name/email are pre-filled from Google, so "in progress" means the ISSUE has started being described
    const { title, description, address } = state.draft;
    const hasDraftInProgress = !!(title || description || address);

    // Cheap shortcut: a ticket number almost always means a status check — no LLM call needed
    if (TICKET_PATTERN.test(latest) && !hasDraftInProgress) {
      return { intent: 'status_check' };
    }

    const { intent } = await this.llm.generateStructured(
      [{ role: 'system', content: ROUTER_PROMPT(hasDraftInProgress) }, ...recentMessages(state, 6)],
      intentSchema,
      { temperature: 0 },
    );
    return { intent: intent as Intent };
  }
}
