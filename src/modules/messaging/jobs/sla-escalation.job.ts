import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { SlaRepository } from './sla.repository.js';

const INTERVAL_MS = 60_000;
const BATCH = 50;

/**
 * SLA escalation runs on a timer, not on a Kafka event: a deadline passing is the absence of an event.
 * Every minute it escalates overdue complaints; the resulting "complaint.sla-breached" events flow
 * through the outbox → Kafka → notification service, like everything else.
 */
@Injectable()
export class SlaEscalationJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SlaEscalationJob.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly sla: SlaRepository) {}

  onApplicationBootstrap(): void {
    this.running = true;
    this.schedule(5_000); // first run shortly after startup
    this.logger.log('SLA escalation job started (every 60s)');
  }

  onModuleDestroy(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(delay: number): void {
    if (this.running) this.timer = setTimeout(() => void this.run(), delay);
  }

  private async run(): Promise<void> {
    try {
      let tickets: string[];
      do {
        tickets = await this.sla.escalateBreached(BATCH);
        if (tickets.length) this.logger.warn(`SLA breached, escalated: ${tickets.join(', ')}`);
      } while (tickets.length === BATCH && this.running);
    } catch (err) {
      this.logger.error(`SLA escalation failed: ${(err as Error).message}`);
    }
    this.schedule(INTERVAL_MS);
  }
}
