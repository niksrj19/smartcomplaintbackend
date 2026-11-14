import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Command } from '@langchain/langgraph';
import { ProviderError } from '../../common/errors/provider.error.js';
import { GuardrailViolationError } from '../guardrails/guardrail.errors.js';
import { AiRepository } from './ai.repository.js';
import type { AgentTurnResult, CitizenProfile, GeoPoint, ReviewDecision, UiMessage } from './agent.types.js';
import { type AgentGraph, AgentGraphFactory } from './graph/agent.graph.js';
import { REVIEW_NODE } from './graph/nodes/human-review.node.js';

const FALLBACK_REPLY: UiMessage = {
  type: 'TEXT',
  content: "Sorry, I'm having trouble right now. Please try again in a moment.",
};

/**
 * The AI layer's single entry point. The chat module talks to this — never to the graph or the LLM directly.
 */
@Injectable()
export class AiService implements OnModuleInit {
  private readonly logger = new Logger(AiService.name);
  private graph!: AgentGraph;

  constructor(
    private readonly factory: AgentGraphFactory,
    private readonly repo: AiRepository,
  ) {}

  onModuleInit(): void {
    this.graph = this.factory.build();
  }

  /**
   * A message typed by the citizen. If a draft is waiting for review,
   * the message is treated as an edit request and resumes the paused graph.
   */
  async handleMessage(
    sessionId: string,
    citizen: CitizenProfile,
    text: string,
    photoKeys: string[] = [],
    location?: GeoPoint,
  ): Promise<AgentTurnResult> {
    if (await this.isAwaitingReview(sessionId)) {
      return this.resume(sessionId, { action: 'edit', text, photoKeys, location });
    }
    return this.run(sessionId, {
      citizenProfile: citizen,
      pendingInput: text,
      pendingPhotoKeys: photoKeys,
      pendingLocation: location ?? null,
    });
  }

  /** Called by the chat module AFTER it has created the complaint from the draft. */
  async completeSubmission(sessionId: string, ticketNumber: string): Promise<AgentTurnResult> {
    return this.resume(sessionId, { action: 'submitted', ticketNumber });
  }

  async discardDraft(sessionId: string): Promise<AgentTurnResult> {
    await this.repo.discardPendingDrafts(sessionId);
    return this.resume(sessionId, { action: 'discard' });
  }

  /** The draft id currently waiting for Submit, if any */
  async getPendingDraftId(sessionId: string): Promise<string | null> {
    const state = await this.graph.getState(this.config(sessionId));
    return state.next.includes(REVIEW_NODE) ? ((state.values.draftId as string | null) ?? null) : null;
  }

  private async isAwaitingReview(sessionId: string): Promise<boolean> {
    const state = await this.graph.getState(this.config(sessionId));
    return state.next.includes(REVIEW_NODE);
  }

  private resume(sessionId: string, decision: ReviewDecision): Promise<AgentTurnResult> {
    return this.run(sessionId, new Command({ resume: decision }));
  }

  /**
   * Runs the graph and returns only the UI messages produced during THIS turn.
   * If a node fails, LangGraph keeps the last good checkpoint, so the citizen can simply retry.
   */
  private async run(sessionId: string, input: Command | Record<string, unknown>): Promise<AgentTurnResult> {
    const config = this.config(sessionId);
    const before = await this.graph.getState(config);
    const seen = ((before.values.uiMessages as UiMessage[] | undefined) ?? []).length;

    try {
      await this.graph.invoke(input as never, config);
    } catch (err) {
      if (err instanceof GuardrailViolationError) {
        this.logger.warn(`Guardrail stopped turn for ${sessionId}: ${err.message}`);
        return { ...(await this.snapshot(sessionId)), replies: [{ type: 'TEXT', content: err.userMessage }] };
      }
      if (err instanceof ProviderError) {
        this.logger.error(`AI provider failed for ${sessionId}: ${err.message}`);
        return { ...(await this.snapshot(sessionId)), replies: [FALLBACK_REPLY] };
      }
      throw err;
    }

    const after = await this.graph.getState(config);
    const all = (after.values.uiMessages as UiMessage[] | undefined) ?? [];
    const awaiting = after.next.includes(REVIEW_NODE);
    return {
      replies: all.slice(seen),
      awaitingConfirmation: awaiting,
      draftId: awaiting ? ((after.values.draftId as string | null) ?? null) : null,
    };
  }

  private async snapshot(sessionId: string): Promise<Omit<AgentTurnResult, 'replies'>> {
    const state = await this.graph.getState(this.config(sessionId));
    const awaiting = state.next.includes(REVIEW_NODE);
    return { awaitingConfirmation: awaiting, draftId: awaiting ? ((state.values.draftId as string | null) ?? null) : null };
  }

  private config(sessionId: string) {
    return { configurable: { thread_id: sessionId } };
  }
}
