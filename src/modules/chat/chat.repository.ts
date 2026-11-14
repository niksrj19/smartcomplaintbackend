import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { ChatMessage } from '../../generated/prisma/client.js';
import type { GeoPoint, UiMessage } from '../ai/agent.types.js';

/**
 * Stores the visible chat transcript (for reloading the page and for staff to see context).
 * The agent's own working memory lives separately in the LangGraph checkpoint tables.
 */
@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  createSession(citizenId: string): Promise<{ id: string }> {
    return this.prisma.chatSession.create({ data: { citizenId }, select: { id: true } });
  }

  /** True only if the session exists AND belongs to this citizen */
  async isOwnedBy(sessionId: string, citizenId: string): Promise<boolean> {
    return (await this.prisma.chatSession.count({ where: { id: sessionId, citizenId } })) > 0;
  }

  /** The citizen's recent conversations, newest first (for a "continue chat" list) */
  listSessions(citizenId: string, limit = 20) {
    return this.prisma.chatSession.findMany({
      where: { citizenId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, createdAt: true } },
      },
    });
  }

  saveUserMessage(sessionId: string, content: string, photoKeys: string[], location?: GeoPoint): Promise<ChatMessage> {
    const payload = {
      ...(photoKeys.length ? { photoKeys } : {}),
      ...(location ? { location: { ...location } } : {}),
    };
    return this.prisma.chatMessage.create({
      data: {
        sessionId,
        role: 'USER',
        type: 'TEXT',
        content,
        payload: Object.keys(payload).length ? payload : undefined,
      },
    });
  }

  /** Saved one by one so createdAt keeps them in order */
  async saveAssistantMessages(sessionId: string, messages: UiMessage[]): Promise<ChatMessage[]> {
    const saved: ChatMessage[] = [];
    for (const m of messages) {
      saved.push(
        await this.prisma.chatMessage.create({
          data: { sessionId, role: 'ASSISTANT', type: m.type, content: m.content, payload: m.payload as object | undefined },
        }),
      );
    }
    return saved;
  }

  listMessages(sessionId: string, limit = 100): Promise<ChatMessage[]> {
    return this.prisma.chatMessage.findMany({
      where: { sessionId, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
}
