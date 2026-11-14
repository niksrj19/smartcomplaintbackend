import { Injectable } from '@nestjs/common';
import type { AgentStateType, AgentStateUpdate } from '../agent.state.js';

/** Node 9 — after Submit (or discard): confirm to the citizen and clear the draft so a new complaint can start. */
@Injectable()
export class FinalizeNode {
  run(state: AgentStateType): AgentStateUpdate {
    const ticketNumber = state.submittedTicket;
    const reset: AgentStateUpdate = {
      submittedTicket: null,
      intent: null,
      draft: {},
      invalidFields: [],
      photoKeys: [],
      candidates: [],
      classification: null,
      duplicates: [],
      draftId: null,
      draftVersion: 0,
    };

    if (ticketNumber) {
      const content = `Your complaint has been registered. Your ticket number is ${ticketNumber}. We've emailed you a confirmation and you'll get updates as it progresses. You can ask me for its status any time.`;
      return {
        ...reset,
        messages: [{ role: 'assistant', content }],
        uiMessages: [{ type: 'COMPLAINT_CONFIRMATION', content, payload: { ticketNumber } }],
      };
    }

    const content = 'No problem, I have discarded that draft. Is there another issue you would like to report?';
    return { ...reset, messages: [{ role: 'assistant', content }], uiMessages: [{ type: 'TEXT', content }] };
  }
}
