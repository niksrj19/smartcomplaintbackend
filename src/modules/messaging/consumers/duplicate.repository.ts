import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';

export interface DuplicateMatch {
  id: string;
  ticketNumber: string;
  similarity: number;
}

@Injectable()
export class DuplicateRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Closest OLDER open complaint in the same department (last 30 days) by embedding similarity.
   * Only "root" complaints are candidates, so duplicates always point at the original.
   */
  async findClosestOriginal(complaintId: string): Promise<DuplicateMatch | null> {
    const rows = await this.prisma.$queryRaw<{ id: string; ticket_number: string; distance: number }[]>`
      SELECT o.id, o.ticket_number, (n.embedding <=> o.embedding) AS distance
      FROM complaints n
      JOIN complaints o
        ON o.id <> n.id
       AND o.department_id = n.department_id
       AND o.created_at < n.created_at
       AND o.created_at > n.created_at - interval '30 days'
       AND o.duplicate_of_id IS NULL
       AND o.embedding IS NOT NULL
       AND o.status IN ('SUBMITTED', 'ASSIGNED', 'IN_PROGRESS')
      WHERE n.id = ${complaintId}::uuid AND n.embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT 1`;
    const r = rows[0];
    return r ? { id: r.id, ticketNumber: r.ticket_number, similarity: Number((1 - Number(r.distance)).toFixed(4)) } : null;
  }

  /** Links once (only if not already linked) and notes it in the timeline. Returns false if already linked. */
  async link(complaintId: string, original: DuplicateMatch): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.complaint.updateMany({
        where: { id: complaintId, duplicateOfId: null },
        data: { duplicateOfId: original.id },
      });
      if (count === 0) return false;
      const c = await tx.complaint.findUniqueOrThrow({ where: { id: complaintId }, select: { status: true } });
      await tx.complaintStatusHistory.create({
        data: {
          complaintId,
          oldStatus: c.status,
          newStatus: c.status,
          changedById: null,
          remark: `Possible duplicate of ${original.ticketNumber} (similarity ${Math.round(original.similarity * 100)}%)`,
        },
      });
      return true;
    });
  }
}
