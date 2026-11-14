import { Injectable } from '@nestjs/common';
import { InputGuardService } from '../../../guardrails/input.guard.js';
import type { AgentStateType, AgentStateUpdate } from '../agent.state.js';

/**
 * Node 1 — every message (new turn or an edit on a draft) passes here first.
 * Blocked input never reaches the LLM or the conversation history.
 */
@Injectable()
export class GuardInputNode {
  constructor(private readonly inputGuard: InputGuardService) {}

  async run(state: AgentStateType): Promise<AgentStateUpdate> {
    const raw = state.pendingInput ?? '';
    const result = await this.inputGuard.check(raw);
    const newPhotos = state.pendingPhotoKeys.filter((k) => !state.photoKeys.includes(k));

    if (!result.allowed) {
      const message =
        result.violations.find((v) => v.severity === 'block')?.message ?? 'Please rephrase your message.';
      return {
        blocked: true,
        pendingInput: null,
        pendingPhotoKeys: [],
        pendingLocation: null,
        uiMessages: [{ type: 'TEXT', content: message }],
      };
    }

    const photoNote = newPhotos.length ? `\n[Citizen attached ${newPhotos.length} photo(s)]` : '';
    // Coordinates go straight onto the draft. The LLM only hears that a pin was shared, so it never
    // copies raw numbers into the address (a typed address or landmark is still required).
    const loc = state.pendingLocation;
    const locationNote = loc ? '\n[Citizen shared their current GPS location for the issue]' : '';
    return {
      blocked: false,
      pendingInput: null,
      pendingPhotoKeys: [],
      pendingLocation: null,
      ...(loc
        ? { draft: { ...state.draft, latitude: round6(loc.latitude), longitude: round6(loc.longitude) } }
        : {}),
      photoKeys: [...state.photoKeys, ...newPhotos].slice(0, 5),
      messages: [{ role: 'user', content: result.text + photoNote + locationNote }],
    };
  }
}

/** ~11 cm precision is plenty, and avoids storing noisy digits */
function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
