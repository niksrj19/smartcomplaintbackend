import { Injectable } from '@nestjs/common';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import { complaintDraftSchema } from '../../../../shared/schemas/complaint-draft.schema.js';
import { OutputGuardService } from '../../../guardrails/output.guard.js';
import { AiRepository } from '../../ai.repository.js';
import type { AgentStateType, AgentStateUpdate } from '../agent.state.js';

/**
 * Node 7 — validates the complete draft against the shared schema, saves it,
 * and sends a COMPLAINT_DRAFT message (the frontend renders it as a card with Submit / Edit).
 */
@Injectable()
export class CreateDraftNode {
  constructor(
    private readonly repo: AiRepository,
    private readonly outputGuard: OutputGuardService,
  ) {}

  async run(state: AgentStateType, config: LangGraphRunnableConfig): Promise<AgentStateUpdate> {
    const sessionId = config.configurable?.thread_id as string;
    const c = state.classification!;

    const validation = await this.outputGuard.validate(
      {
        ...state.draft,
        departmentCode: c.departmentCode,
        category: c.category,
        priority: c.priority,
        photoKeys: state.photoKeys,
      },
      complaintDraftSchema,
    );
    if (!validation.ok) {
      // Shouldn't happen (fields were validated on extraction) — ask the citizen to clarify
      const content = 'Some details need another look. Could you confirm your name, email and the location of the issue?';
      return { messages: [{ role: 'assistant', content }], uiMessages: [{ type: 'TEXT', content }] };
    }

    const d = validation.data;
    const saved = await this.repo.createDraft({
      sessionId,
      citizenName: d.citizenName,
      citizenEmail: d.citizenEmail,
      citizenPhone: d.citizenPhone,
      departmentId: c.departmentId,
      category: d.category,
      priority: d.priority,
      title: d.title,
      description: d.description,
      address: d.address,
      latitude: d.latitude,
      longitude: d.longitude,
      photoKeys: d.photoKeys ?? [],
    });

    const content = state.duplicates.length
      ? "Here's your complaint draft. A similar open complaint already exists (shown below) — you can still submit yours. Please review and click Submit, or tell me what to change."
      : "Here's your complaint draft. Please review it and click Submit, or tell me what to change.";

    return {
      draftId: saved.id,
      draftVersion: saved.version,
      messages: [{ role: 'assistant', content: `${content}\n[Draft v${saved.version} shown: ${JSON.stringify(d)}]` }],
      uiMessages: [
        {
          type: 'COMPLAINT_DRAFT',
          content,
          payload: {
            draftId: saved.id,
            version: saved.version,
            ...d,
            departmentName: c.departmentName,
            priorityReason: c.priorityReason,
            possibleDuplicates: state.duplicates,
          },
        },
      ],
    };
  }
}
