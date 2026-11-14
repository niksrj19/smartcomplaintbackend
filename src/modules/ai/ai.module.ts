import { Module } from '@nestjs/common';
import { DepartmentsModule } from '../departments/departments.module.js';
import { GuardrailsModule } from '../guardrails/guardrails.module.js';
import { AiRepository } from './ai.repository.js';
import { AiService } from './ai.service.js';
import { CheckpointerShutdown, checkpointerProvider } from './checkpointer.provider.js';
import { AgentGraphFactory } from './graph/agent.graph.js';
import { AskMissingNode } from './graph/nodes/ask-missing.node.js';
import { CheckDuplicatesNode } from './graph/nodes/check-duplicates.node.js';
import { ClassifyNode } from './graph/nodes/classify.node.js';
import { CreateDraftNode } from './graph/nodes/create-draft.node.js';
import { ExtractDetailsNode } from './graph/nodes/extract-details.node.js';
import { FinalizeNode } from './graph/nodes/finalize.node.js';
import { GeneralReplyNode } from './graph/nodes/general-reply.node.js';
import { GuardInputNode } from './graph/nodes/guard-input.node.js';
import { HumanReviewNode } from './graph/nodes/human-review.node.js';
import { RouteIntentNode } from './graph/nodes/route-intent.node.js';
import { StatusCheckNode } from './graph/nodes/status-check.node.js';

@Module({
  imports: [GuardrailsModule, DepartmentsModule],
  providers: [
    checkpointerProvider,
    CheckpointerShutdown,
    AiRepository,
    AgentGraphFactory,
    AiService,
    GuardInputNode,
    RouteIntentNode,
    ExtractDetailsNode,
    AskMissingNode,
    ClassifyNode,
    CheckDuplicatesNode,
    CreateDraftNode,
    HumanReviewNode,
    FinalizeNode,
    StatusCheckNode,
    GeneralReplyNode,
  ],
  exports: [AiService],
})
export class AiModule {}
