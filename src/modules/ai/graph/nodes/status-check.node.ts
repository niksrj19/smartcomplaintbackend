import { Injectable } from '@nestjs/common';
import { AiRepository } from '../../ai.repository.js';
import { type AgentStateType, type AgentStateUpdate, assistantText } from '../agent.state.js';
import { TICKET_PATTERN } from './route-intent.node.js';

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'received and waiting to be assigned',
  ASSIGNED: 'assigned to an officer',
  IN_PROGRESS: 'being worked on',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  REJECTED: 'rejected',
};

/** Branch — answers "what's the status of my complaint?" straight from the database (no LLM, no guessing). */
@Injectable()
export class StatusCheckNode {
  constructor(private readonly repo: AiRepository) {}

  async run(state: AgentStateType): Promise<AgentStateUpdate> {
    const latest = state.messages.at(-1)?.content ?? '';
    const ticket = latest.match(TICKET_PATTERN)?.[0]?.toUpperCase();

    if (!ticket) {
      return assistantText('Sure — please share your ticket number. It looks like SC-2026-00123.');
    }

    const citizenId = state.citizenProfile?.id;
    const complaint = citizenId ? await this.repo.findComplaintStatus(ticket, citizenId) : null;
    if (!complaint) {
      return assistantText(
        `I couldn't find ticket ${ticket} on your account. Please check the number — you can also see all your complaints under "My complaints".`,
      );
    }

    const updated = complaint.updatedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return assistantText(
      `Ticket ${complaint.ticketNumber} ("${complaint.title}") is ${STATUS_LABELS[complaint.status] ?? complaint.status.toLowerCase()}. ` +
        `It's with ${complaint.departmentName}, last updated on ${updated}.`,
    );
  }
}
