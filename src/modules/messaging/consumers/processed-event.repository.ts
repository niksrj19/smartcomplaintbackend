import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';

/** One row per (event, consumer) — how consumers stay idempotent under Kafka's at-least-once delivery */
@Injectable()
export class ProcessedEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isProcessed(eventId: string, consumer: string): Promise<boolean> {
    const row = await this.prisma.processedEvent.findUnique({
      where: { eventId_consumer: { eventId, consumer } },
      select: { eventId: true },
    });
    return row !== null;
  }

  async markProcessed(eventId: string, consumer: string): Promise<void> {
    await this.prisma.processedEvent.createMany({ data: [{ eventId, consumer }], skipDuplicates: true });
  }
}
