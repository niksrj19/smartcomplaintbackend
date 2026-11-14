import { Inject, Injectable } from '@nestjs/common';
import { LLM_PROVIDER, type LlmProvider } from '../../../../ports/llm.provider.js';
import { OutputGuardService } from '../../../guardrails/output.guard.js';
import { ASK_MISSING_PROMPT } from '../../prompts/agent.prompts.js';
import { type AgentStateType, type AgentStateUpdate, assistantText, recentMessages } from '../agent.state.js';
import { ExtractDetailsNode } from './extract-details.node.js';

/** Node 4 — the info-collection loop: asks for whatever is still missing, then waits for the next message. */
@Injectable()
export class AskMissingNode {
  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly outputGuard: OutputGuardService,
  ) {}

  async run(state: AgentStateType): Promise<AgentStateUpdate> {
    const missing = ExtractDetailsNode.missingFields(state.draft);
    const reply = await this.llm.chat(
      [
        { role: 'system', content: ASK_MISSING_PROMPT(state.draft, missing, state.invalidFields) },
        ...recentMessages(state, 12),
      ],
      { temperature: 0.4, maxTokens: 300 },
    );
    let content = this.outputGuard.sanitizeReply(reply.content);
    // The 📍 button is optional: mention it once the bot needs the location and no pin was shared yet
    const needsLocation = !state.draft.address && state.draft.latitude === undefined;
    const alreadyTold = state.messages.some((m) => m.role === 'assistant' && m.content.includes('tap 📍'));
    if (needsLocation && !alreadyTold) content += '\n\nTip: you can also tap 📍 below to share your current location (optional).';
    return assistantText(content);
  }
}
