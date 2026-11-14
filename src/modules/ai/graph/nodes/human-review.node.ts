import { Injectable } from '@nestjs/common';
import { Command, interrupt } from '@langchain/langgraph';
import type { ReviewDecision } from '../../agent.types.js';
import type { AgentStateType } from '../agent.state.js';

export const REVIEW_NODE = 'humanReview';

/**
 * Node 8 — HUMAN-IN-THE-LOOP. The graph pauses here (state saved in Postgres) until the citizen acts.
 * The Submit button does NOT go through the LLM: the chat module creates the complaint itself,
 * then resumes the graph with { action: 'submitted' }.
 *
 * Note: LangGraph re-runs this node from the top on resume, so it must have no side effects before interrupt().
 */
@Injectable()
export class HumanReviewNode {
  run(state: AgentStateType): Command {
    const decision = interrupt<{ draftId: string | null }, ReviewDecision>({ draftId: state.draftId });

    switch (decision.action) {
      case 'edit':
        // The edit text is a new message → back through the guardrail and the whole flow
        return new Command({
          goto: 'guardInput',
          update: {
            pendingInput: decision.text,
            pendingPhotoKeys: decision.photoKeys ?? [],
            pendingLocation: decision.location ?? null,
          },
        });
      case 'submitted':
        return new Command({ goto: 'finalize', update: { submittedTicket: decision.ticketNumber } });
      case 'discard':
        return new Command({ goto: 'finalize', update: { submittedTicket: null } });
    }
  }
}
