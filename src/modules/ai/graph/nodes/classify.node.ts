import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { LLM_PROVIDER, type LlmMessage, type LlmProvider } from '../../../../ports/llm.provider.js';
import { complaintPrioritySchema } from '../../../../shared/schemas/complaint-draft.schema.js';
import { DepartmentsService } from '../../../departments/departments.service.js';
import { OutputGuardService } from '../../../guardrails/output.guard.js';
import { CLASSIFY_PROMPT } from '../../prompts/agent.prompts.js';
import type { AgentStateType, AgentStateUpdate } from '../agent.state.js';

const classificationSchema = z.object({
  departmentCode: z.string().min(2).max(40),
  category: z.string().trim().min(2).max(60),
  priority: complaintPrioritySchema,
  priorityReason: z.string().min(5).max(300),
});

/**
 * Node 5 — picks the department and priority.
 * Embeddings narrow it down, the LLM decides, and the output guard checks the
 * department really exists (retrying with feedback if the LLM invents one).
 */
@Injectable()
export class ClassifyNode {
  private readonly logger = new Logger(ClassifyNode.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly departments: DepartmentsService,
    private readonly outputGuard: OutputGuardService,
  ) {}

  async run(state: AgentStateType): Promise<AgentStateUpdate> {
    const { title = '', description = '', address = '' } = state.draft;
    const complaintText = `${title}. ${description}`;

    const [active, candidates] = await Promise.all([
      this.departments.list(),
      this.departments.findBestMatches(complaintText, 3).catch((err: unknown) => {
        // Embeddings down? Classification still works from the department list alone
        this.logger.warn(`Department matching unavailable: ${(err as Error).message}`);
        return [];
      }),
    ]);
    const validCodes = new Set(active.map((d) => d.code));

    const baseMessages: LlmMessage[] = [
      { role: 'system', content: CLASSIFY_PROMPT(active, candidates) },
      { role: 'user', content: `Title: ${title}\nDescription: ${description}\nLocation: ${address}` },
    ];

    const result = await this.outputGuard.generateWithRetry({
      schema: classificationSchema,
      rules: [
        {
          name: 'department-exists',
          check: (c) =>
            validCodes.has(c.departmentCode.toUpperCase())
              ? null
              : `"${c.departmentCode}" is not a valid department code. Use one of: ${[...validCodes].join(', ')}`,
        },
      ],
      generate: (feedback) =>
        this.llm.generateStructured(
          feedback ? [...baseMessages, { role: 'user', content: feedback }] : baseMessages,
          classificationSchema,
          { temperature: 0 },
        ),
    });

    const dept = active.find((d) => d.code === result.departmentCode.toUpperCase())!;
    return {
      candidates,
      classification: {
        departmentId: dept.id,
        departmentCode: dept.code,
        departmentName: dept.name,
        category: result.category,
        priority: result.priority,
        priorityReason: result.priorityReason,
      },
    };
  }
}
