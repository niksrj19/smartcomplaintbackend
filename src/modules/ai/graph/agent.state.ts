import { Annotation } from '@langchain/langgraph';
import type { LlmMessage } from '../../../ports/llm.provider.js';
import type { DepartmentMatch } from '../../departments/dto/department.schemas.js';
import type {
  CitizenProfile,
  GeoPoint,
  Classification,
  DraftFields,
  Intent,
  PossibleDuplicate,
  UiMessage,
} from '../agent.types.js';

const append = <T>(a: T[], b: T[]): T[] => a.concat(b);
const replace = <T>(_a: T, b: T): T => b;

/**
 * The agent's memory for one chat session, saved after every step by the Postgres checkpointer.
 * Uses our own vendor-neutral LlmMessage type, so switching LLMs never touches saved state.
 */
export const AgentState = Annotation.Root({
  /** Conversation the LLM sees (appended) */
  messages: Annotation<LlmMessage[]>({ reducer: append, default: () => [] }),
  /** Messages for the frontend: text bubbles, draft cards, confirmations (appended) */
  uiMessages: Annotation<UiMessage[]>({ reducer: append, default: () => [] }),

  /** Signed-in citizen — set on every new turn */
  citizenProfile: Annotation<CitizenProfile | null>({ reducer: replace, default: () => null }),

  /** Raw input for this turn — the guard node checks it before it joins `messages` */
  pendingInput: Annotation<string | null>({ reducer: replace, default: () => null }),
  pendingPhotoKeys: Annotation<string[]>({ reducer: replace, default: () => [] }),
  /** Location shared with this message, if any (moved onto the draft by the guard node) */
  pendingLocation: Annotation<GeoPoint | null>({ reducer: replace, default: () => null }),
  blocked: Annotation<boolean>({ reducer: replace, default: () => false }),

  intent: Annotation<Intent | null>({ reducer: replace, default: () => null }),
  draft: Annotation<DraftFields>({ reducer: replace, default: () => ({}) }),
  /** Fields the citizen gave but that failed validation, e.g. a bad email */
  invalidFields: Annotation<string[]>({ reducer: replace, default: () => [] }),
  photoKeys: Annotation<string[]>({ reducer: replace, default: () => [] }),

  candidates: Annotation<DepartmentMatch[]>({ reducer: replace, default: () => [] }),
  classification: Annotation<Classification | null>({ reducer: replace, default: () => null }),
  duplicates: Annotation<PossibleDuplicate[]>({ reducer: replace, default: () => [] }),

  draftId: Annotation<string | null>({ reducer: replace, default: () => null }),
  draftVersion: Annotation<number>({ reducer: replace, default: () => 0 }),
  /** Set by the chat module when Submit succeeds */
  submittedTicket: Annotation<string | null>({ reducer: replace, default: () => null }),
});

export type AgentStateType = typeof AgentState.State;
export type AgentStateUpdate = typeof AgentState.Update;

/** Keeps prompts small: the LLM only sees the most recent messages */
export function recentMessages(state: AgentStateType, max = 20): LlmMessage[] {
  return state.messages.slice(-max);
}

export function assistantText(content: string): Pick<AgentStateUpdate, 'messages' | 'uiMessages'> {
  return {
    messages: [{ role: 'assistant', content }],
    uiMessages: [{ type: 'TEXT', content }],
  };
}
