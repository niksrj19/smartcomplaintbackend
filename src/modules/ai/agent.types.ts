import type { ComplaintPriority } from '../../shared/schemas/complaint-draft.schema.js';

/** Matches the ChatMessageType enum in Prisma — what the frontend renders */
export type UiMessageType = 'TEXT' | 'COMPLAINT_DRAFT' | 'COMPLAINT_CONFIRMATION';

export interface UiMessage {
  type: UiMessageType;
  content: string;
  payload?: Record<string, unknown>;
}

/** The signed-in citizen (from Google). Name and email are known up front, so the bot never asks for them. */
export interface CitizenProfile {
  id: string;
  name: string;
  email: string;
}

export type Intent = 'new_complaint' | 'status_check' | 'general' | 'off_topic';

/** Details collected from the conversation (all optional until complete) */
export interface DraftFields {
  citizenName?: string;
  citizenEmail?: string;
  citizenPhone?: string;
  title?: string;
  description?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

/** A position shared from the citizen's browser. Optional: the typed address is still required. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export const REQUIRED_DRAFT_FIELDS = ['citizenName', 'citizenEmail', 'title', 'description', 'address'] as const;

export interface Classification {
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  category: string;
  priority: ComplaintPriority;
  priorityReason: string;
}

export interface PossibleDuplicate {
  ticketNumber: string;
  title: string;
  status: string;
  similarity: number;
}

/** How the chat module resumes the graph while it's paused on a draft */
export type ReviewDecision =
  | { action: 'edit'; text: string; photoKeys?: string[]; location?: GeoPoint }
  | { action: 'submitted'; ticketNumber: string }
  | { action: 'discard' };

export interface AgentTurnResult {
  /** New messages to show, in order */
  replies: UiMessage[];
  /** True while a draft card is waiting for Submit / Edit */
  awaitingConfirmation: boolean;
  draftId: string | null;
}
