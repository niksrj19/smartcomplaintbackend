import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER, type LlmProvider } from '../../../../ports/llm.provider.js';
import { OutputGuardService } from '../../../guardrails/output.guard.js';
import { GENERAL_PROMPT, OFF_TOPIC_REPLY } from '../../prompts/agent.prompts.js';
import { type AgentStateType, type AgentStateUpdate, assistantText, recentMessages } from '../agent.state.js';

/** Branch — greetings and questions about the service. Off-topic gets a fixed reply (no LLM call). */
@Injectable()
export class GeneralReplyNode {
  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly outputGuard: OutputGuardService,
  ) {}

  async run(state: AgentStateType): Promise<AgentStateUpdate> {
    if (state.intent === 'off_topic') return assistantText(OFF_TOPIC_REPLY);

    const reply = await this.llm.chat(
      [{ role: 'system', content: GENERAL_PROMPT }, ...recentMessages(state, 6)],
      { temperature: 0.4, maxTokens: 250 },
    );
    return assistantText(this.outputGuard.sanitizeReply(reply.content));
  }
}
