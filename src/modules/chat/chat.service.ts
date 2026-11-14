import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service.js';
import type { ChatMessage } from '../../generated/prisma/client.js';
import { CACHE_SERVICE, type CacheService } from '../../ports/cache.service.js';
import type { AgentTurnResult, CitizenProfile, UiMessage } from '../ai/agent.types.js';
import { AiService } from '../ai/ai.service.js';
import { ComplaintsService } from '../complaints/complaints.service.js';
import { StorageService } from '../storage/storage.service.js';
import { ChatRepository } from './chat.repository.js';
import type { ChatMessageView, ChatTurnResponse, SendMessageDto } from './dto/chat.schemas.js';

const welcome = (name: string): UiMessage => ({
  type: 'TEXT',
  content: `Hi ${name.split(' ')[0]}! I'm the Smart City assistant. Tell me about a civic issue near you — like a pothole, water problem, garbage or a broken street light — and I'll register a complaint for you. You can also ask about one of your existing tickets.`,
});

export interface ChatSessionSummary {
  sessionId: string;
  createdAt: Date;
  lastMessage: string | null;
  lastMessageAt: Date | null;
}

const LOCK_SECONDS = 60;

/**
 * Orchestrates a chat turn: rate limit → lock session → save the user's message
 * → run the AI agent → save the replies. Knows nothing about LLMs or LangGraph.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly repo: ChatRepository,
    private readonly ai: AiService,
    private readonly complaints: ComplaintsService,
    private readonly storage: StorageService,
    private readonly rateLimit: RateLimitService,
    @Inject(CACHE_SERVICE) private readonly cache: CacheService,
  ) {}

  /** Every session belongs to a signed-in citizen from the very first message */
  async startSession(citizen: CitizenProfile): Promise<ChatTurnResponse> {
    await this.rateLimit.consume({ name: 'chat-session', limit: 20, windowSeconds: 3600 }, citizen.id);
    const session = await this.repo.createSession(citizen.id);
    const saved = await this.repo.saveAssistantMessages(session.id, [welcome(citizen.name)]);
    return { sessionId: session.id, messages: saved.map(toView), awaitingConfirmation: false, draftId: null };
  }

  async listSessions(citizen: CitizenProfile): Promise<ChatSessionSummary[]> {
    const sessions = await this.repo.listSessions(citizen.id);
    return sessions.map((s) => ({
      sessionId: s.id,
      createdAt: s.createdAt,
      lastMessage: s.messages[0]?.content.slice(0, 120) ?? null,
      lastMessageAt: s.messages[0]?.createdAt ?? null,
    }));
  }

  async history(citizen: CitizenProfile, sessionId: string): Promise<ChatTurnResponse> {
    await this.assertOwned(sessionId, citizen.id);
    const [messages, draftId] = await Promise.all([
      this.repo.listMessages(sessionId),
      this.ai.getPendingDraftId(sessionId),
    ]);
    return { sessionId, messages: messages.map(toView), awaitingConfirmation: !!draftId, draftId };
  }

  async sendMessage(citizen: CitizenProfile, sessionId: string, dto: SendMessageDto): Promise<ChatTurnResponse> {
    await this.assertOwned(sessionId, citizen.id);
    await this.rateLimit.consume({ name: 'chat-msg-session', limit: 30, windowSeconds: 60 }, sessionId);
    await this.rateLimit.consume({ name: 'chat-msg-citizen', limit: 200, windowSeconds: 3600 }, citizen.id);

    return this.withSessionLock(sessionId, async () => {
      // Photos must really be uploaded before the agent hears about them
      const photoKeys = dto.photoKeys?.length
        ? (await this.storage.verifyPhotos(dto.photoKeys)).map((p) => p.key)
        : [];

      const userMessage = await this.repo.saveUserMessage(sessionId, dto.text, photoKeys, dto.location);
      const result = await this.ai.handleMessage(sessionId, citizen, dto.text, photoKeys, dto.location);
      return this.respond(sessionId, result, [userMessage]);
    });
  }

  /**
   * The Submit button. Goes straight to the complaints service — the LLM is not involved.
   * Only the draft currently awaiting review can be submitted (stale cards get 409).
   */
  async submitDraft(
    citizen: CitizenProfile,
    sessionId: string,
    draftId: string,
    idempotencyKey: string,
  ): Promise<ChatTurnResponse> {
    await this.assertOwned(sessionId, citizen.id);

    return this.withSessionLock(sessionId, async () => {
      const pending = await this.ai.getPendingDraftId(sessionId);

      if (pending !== draftId) {
        if (pending !== null) {
          throw new ConflictException('This draft is out of date. Please submit the latest version.');
        }
        // Nothing awaiting review: only a retried click for an already-created complaint is allowed
        const already = await this.complaints.findSubmitted(citizen.id, sessionId, draftId, idempotencyKey);
        if (!already) throw new ConflictException('This draft is no longer active.');
        return this.respond(sessionId, {
          replies: [confirmation(already.ticketNumber)],
          awaitingConfirmation: false,
          draftId: null,
        });
      }

      const created = await this.complaints.submitDraft({ citizenId: citizen.id, sessionId, draftId, idempotencyKey });

      try {
        const result = await this.ai.completeSubmission(sessionId, created.ticketNumber);
        return this.respond(sessionId, result);
      } catch (err) {
        // The complaint IS saved — never tell the citizen it failed just because the chat step did
        this.logger.error(`Complaint ${created.ticketNumber} saved but agent resume failed: ${(err as Error).message}`);
        return this.respond(sessionId, {
          replies: [confirmation(created.ticketNumber)],
          awaitingConfirmation: false,
          draftId: null,
        });
      }
    });
  }

  async discardDraft(citizen: CitizenProfile, sessionId: string, draftId: string): Promise<ChatTurnResponse> {
    await this.assertOwned(sessionId, citizen.id);
    return this.withSessionLock(sessionId, async () => {
      if ((await this.ai.getPendingDraftId(sessionId)) !== draftId) {
        throw new ConflictException('This draft is no longer active.');
      }
      return this.respond(sessionId, await this.ai.discardDraft(sessionId));
    });
  }

  private async respond(
    sessionId: string,
    result: AgentTurnResult,
    userMessages: ChatMessage[] = [],
  ): Promise<ChatTurnResponse> {
    const saved = await this.repo.saveAssistantMessages(sessionId, result.replies);
    return {
      sessionId,
      messages: [...userMessages, ...saved].map(toView),
      awaitingConfirmation: result.awaitingConfirmation,
      draftId: result.draftId,
    };
  }

  /** One agent run per session at a time — stops two quick messages corrupting the conversation state */
  private async withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const key = `chat:lock:${sessionId}`;
    if ((await this.cache.increment(key, LOCK_SECONDS)) > 1) {
      throw new ConflictException('Still working on your previous message — please wait a moment.');
    }
    try {
      return await fn();
    } finally {
      await this.cache.del(key);
    }
  }

  /** 404 (not 403) for someone else's session — doesn't even reveal that it exists */
  private async assertOwned(sessionId: string, citizenId: string): Promise<void> {
    if (!(await this.repo.isOwnedBy(sessionId, citizenId))) throw new NotFoundException('Chat session not found');
  }
}

function confirmation(ticketNumber: string): UiMessage {
  return {
    type: 'COMPLAINT_CONFIRMATION',
    content: `Your complaint has been registered. Your ticket number is ${ticketNumber}.`,
    payload: { ticketNumber },
  };
}

function toView(m: ChatMessage): ChatMessageView {
  return {
    id: m.id,
    role: m.role === 'USER' ? 'USER' : 'ASSISTANT',
    type: m.type,
    content: m.content,
    payload: (m.payload as Record<string, unknown> | null) ?? undefined,
    createdAt: m.createdAt,
  };
}
