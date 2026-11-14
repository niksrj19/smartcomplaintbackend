import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { ComplaintPriority } from '../../shared/schemas/complaint-draft.schema.js';
import type { PossibleDuplicate } from './agent.types.js';

export interface NewDraft {
  sessionId: string;
  citizenName: string;
  citizenEmail: string;
  citizenPhone?: string;
  departmentId: string;
  category: string;
  priority: ComplaintPriority;
  title: string;
  description: string;
  address: string;
  latitude?: number;
  longitude?: number;
  photoKeys: string[];
}

export interface ComplaintStatusView {
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  departmentName: string;
  updatedAt: Date;
}

const DUPLICATE_THRESHOLD = 0.85;

/** Data access for the AI layer — the agent nodes never touch Prisma directly. */
@Injectable()
export class AiRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Older pending drafts in the session become SUPERSEDED, so only the newest can be submitted */
  async createDraft(data: NewDraft): Promise<{ id: string; version: number }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.complaintDraft.updateMany({
        where: { sessionId: data.sessionId, status: 'PENDING' },
        data: { status: 'SUPERSEDED' },
      });
      const last = await tx.complaintDraft.aggregate({
        where: { sessionId: data.sessionId },
        _max: { version: true },
      });
      const draft = await tx.complaintDraft.create({
        data: { ...data, version: (last._max.version ?? 0) + 1 },
        select: { id: true, version: true },
      });
      return draft;
    });
  }

  async discardPendingDrafts(sessionId: string): Promise<void> {
    await this.prisma.complaintDraft.updateMany({
      where: { sessionId, status: 'PENDING' },
      data: { status: 'DISCARDED' },
    });
  }

  /** Open complaints from the last 30 days that read like the same issue */
  async findSimilarOpenComplaints(embedding: number[], limit = 3): Promise<PossibleDuplicate[]> {
    const vector = `[${embedding.join(',')}]`;
    const rows = await this.prisma.$queryRaw<
      { ticket_number: string; title: string; status: string; distance: number }[]
    >`
      SELECT ticket_number, title, status::text AS status, (embedding <=> ${vector}::vector) AS distance
      FROM complaints
      WHERE embedding IS NOT NULL
        AND status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')
        AND created_at > now() - interval '30 days'
      ORDER BY distance ASC
      LIMIT ${limit}`;
    return rows
      .map((r) => ({
        ticketNumber: r.ticket_number,
        title: r.title,
        status: r.status,
        similarity: Number((1 - Number(r.distance)).toFixed(4)),
      }))
      .filter((r) => r.similarity >= DUPLICATE_THRESHOLD);
  }

  /** Only finds the citizen's OWN complaint — nobody can look up someone else's ticket */
  async findComplaintStatus(ticketNumber: string, citizenId: string): Promise<ComplaintStatusView | null> {
    const c = await this.prisma.complaint.findFirst({
      where: { ticketNumber, citizenId },
      select: {
        ticketNumber: true,
        title: true,
        status: true,
        priority: true,
        updatedAt: true,
        department: { select: { name: true } },
      },
    });
    return c
      ? {
          ticketNumber: c.ticketNumber,
          title: c.title,
          status: c.status,
          priority: c.priority,
          departmentName: c.department.name,
          updatedAt: c.updatedAt,
        }
      : null;
  }
}
