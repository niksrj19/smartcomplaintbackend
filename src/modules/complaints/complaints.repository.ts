import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { ComplaintDraft, Department } from '../../generated/prisma/client.js';
import { COMPLAINT_TOPICS, type ComplaintCreatedPayload } from '../../shared/events/complaint.events.js';

export interface CreateFromDraftInput {
  /** The signed-in citizen who owns the chat session */
  citizenId: string;
  draft: ComplaintDraft & { department: Department };
  idempotencyKey: string;
  photos: { key: string; contentType: string; sizeBytes: number }[];
  embedding: number[] | null;
}

export interface CreatedComplaint {
  complaintId: string;
  ticketNumber: string;
}

const SLA_HOURS = {
  CRITICAL: 'slaHoursCritical',
  HIGH: 'slaHoursHigh',
  NORMAL: 'slaHoursNormal',
  LOW: 'slaHoursLow',
} as const;

@Injectable()
export class ComplaintsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findDraft(draftId: string) {
    return this.prisma.complaintDraft.findUnique({
      where: { id: draftId },
      include: { department: true, session: { select: { citizenId: true } } },
    });
  }

  async findByIdempotencyKey(key: string): Promise<CreatedComplaint | null> {
    const c = await this.prisma.complaint.findUnique({
      where: { idempotencyKey: key },
      select: { id: true, ticketNumber: true },
    });
    return c ? { complaintId: c.id, ticketNumber: c.ticketNumber } : null;
  }

  async findByDraftId(draftId: string): Promise<CreatedComplaint | null> {
    const c = await this.prisma.complaint.findUnique({
      where: { draftId },
      select: { id: true, ticketNumber: true },
    });
    return c ? { complaintId: c.id, ticketNumber: c.ticketNumber } : null;
  }

  async listForCitizen(
    citizenId: string,
    opts: { page: number; pageSize: number; status?: string },
  ): Promise<{ items: CitizenComplaintListItem[]; total: number }> {
    const where = { citizenId, ...(opts.status ? { status: opts.status as never } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.complaint.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: { department: { select: { name: true } }, _count: { select: { attachments: true } } },
      }),
      this.prisma.complaint.count({ where }),
    ]);
    return {
      total,
      items: rows.map((c) => ({
        ticketNumber: c.ticketNumber,
        title: c.title,
        category: c.category,
        priority: c.priority,
        status: c.status,
        departmentName: c.department.name,
        address: c.address,
        photoCount: c._count.attachments,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    };
  }

  /** Scoped by citizenId — a citizen can only ever open their own complaint */
  async findForCitizen(citizenId: string, ticketNumber: string): Promise<CitizenComplaintDetail | null> {
    const c = await this.prisma.complaint.findFirst({
      where: { ticketNumber, citizenId },
      include: {
        department: { select: { name: true } },
        attachments: { select: { objectKey: true }, orderBy: { createdAt: 'asc' } },
        statusHistory: { select: { newStatus: true, remark: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!c) return null;
    return {
      ticketNumber: c.ticketNumber,
      title: c.title,
      category: c.category,
      priority: c.priority,
      status: c.status,
      departmentName: c.department.name,
      address: c.address,
      photoCount: c.attachments.length,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      description: c.description,
      latitude: c.latitude,
      longitude: c.longitude,
      slaDueAt: c.slaDueAt,
      resolvedAt: c.resolvedAt,
      photoKeys: c.attachments.map((a) => a.objectKey),
      // Staff names stay internal — the citizen sees what changed and the remark
      timeline: c.statusHistory.map((h) => ({ status: h.newStatus, remark: h.remark, at: h.createdAt })),
    };
  }

  /**
   * THE OUTBOX PATTERN: everything below happens in ONE database transaction.
   * Either the complaint AND its "complaint.created" event are both saved, or neither is.
   * A separate relay publishes outbox rows to Kafka, so no event is ever lost
   * even if Kafka is down at this moment.
   */
  async createFromDraft({
    citizenId,
    draft,
    idempotencyKey,
    photos,
    embedding,
  }: CreateFromDraftInput): Promise<CreatedComplaint> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Claim the draft — only one request can move it from PENDING, which stops double-submits
      const claimed = await tx.complaintDraft.updateMany({
        where: { id: draft.id, status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      });
      if (claimed.count === 0) {
        throw new ConflictException('This draft has already been submitted or replaced by a newer version.');
      }

      // 2. The signed-in (Google-verified) citizen owns the complaint; save their phone if they gave one
      const citizen = await tx.citizen.update({
        where: { id: citizenId },
        data: draft.citizenPhone ? { phone: draft.citizenPhone } : {},
      });

      // 3. Readable ticket number from an atomic per-year counter: SC-2026-00042
      const year = new Date().getFullYear();
      const [{ last_seq }] = await tx.$queryRaw<{ last_seq: number }[]>`
        INSERT INTO ticket_sequences (year, last_seq) VALUES (${year}, 1)
        ON CONFLICT (year) DO UPDATE SET last_seq = ticket_sequences.last_seq + 1
        RETURNING last_seq`;
      const ticketNumber = `SC-${year}-${String(last_seq).padStart(5, '0')}`;

      // 4. The complaint itself, with its SLA deadline from the department's settings
      const slaHours = draft.department[SLA_HOURS[draft.priority]];
      const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);
      const complaint = await tx.complaint.create({
        data: {
          ticketNumber,
          citizenId: citizen.id,
          departmentId: draft.departmentId,
          sessionId: draft.sessionId,
          draftId: draft.id,
          idempotencyKey,
          category: draft.category.trim(),
          priority: draft.priority,
          status: 'SUBMITTED',
          title: draft.title,
          description: draft.description,
          address: draft.address,
          latitude: draft.latitude,
          longitude: draft.longitude,
          slaDueAt,
          attachments: { create: photos.map((p) => ({ objectKey: p.key, contentType: p.contentType, sizeBytes: p.sizeBytes })) },
          statusHistory: { create: { oldStatus: null, newStatus: 'SUBMITTED', remark: 'Submitted by citizen via chat' } },
        },
      });

      // 5. Embedding for duplicate detection (skipped if Gemini was unavailable)
      if (embedding) {
        await tx.$executeRaw`
          UPDATE complaints SET embedding = ${`[${embedding.join(',')}]`}::vector WHERE id = ${complaint.id}::uuid`;
      }

      // 6. The outbox row — same transaction as the complaint
      const payload: ComplaintCreatedPayload = {
        complaintId: complaint.id,
        ticketNumber,
        citizen: { id: citizen.id, name: citizen.name, email: citizen.email, phone: citizen.phone },
        department: {
          id: draft.department.id,
          code: draft.department.code,
          name: draft.department.name,
          contactEmail: draft.department.contactEmail,
        },
        category: complaint.category,
        priority: complaint.priority,
        title: complaint.title,
        description: complaint.description,
        address: complaint.address,
        latitude: complaint.latitude,
        longitude: complaint.longitude,
        photoKeys: photos.map((p) => p.key),
        slaDueAt: slaDueAt.toISOString(),
        createdAt: complaint.createdAt.toISOString(),
      };
      await tx.outboxEvent.create({
        data: {
          aggregateType: 'complaint',
          aggregateId: complaint.id,
          eventType: COMPLAINT_TOPICS.created,
          payload: payload as object,
        },
      });

      return { complaintId: complaint.id, ticketNumber };
    });
  }
}

// ─── Citizen "My complaints" queries ───

export interface CitizenComplaintListItem {
  ticketNumber: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  departmentName: string;
  address: string;
  photoCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CitizenComplaintDetail extends CitizenComplaintListItem {
  description: string;
  latitude: number | null;
  longitude: number | null;
  slaDueAt: Date | null;
  resolvedAt: Date | null;
  photoKeys: string[];
  timeline: { status: string; remark: string | null; at: Date }[];
}
