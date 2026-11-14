import { Inject, Injectable } from '@nestjs/common';
import { END, START, StateGraph } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { CHECKPOINTER } from '../checkpointer.provider.js';
import { type AgentStateType, AgentState } from './agent.state.js';
import { AskMissingNode } from './nodes/ask-missing.node.js';
import { CheckDuplicatesNode } from './nodes/check-duplicates.node.js';
import { ClassifyNode } from './nodes/classify.node.js';
import { CreateDraftNode } from './nodes/create-draft.node.js';
import { ExtractDetailsNode } from './nodes/extract-details.node.js';
import { FinalizeNode } from './nodes/finalize.node.js';
import { GeneralReplyNode } from './nodes/general-reply.node.js';
import { GuardInputNode } from './nodes/guard-input.node.js';
import { HumanReviewNode, REVIEW_NODE } from './nodes/human-review.node.js';
import { RouteIntentNode } from './nodes/route-intent.node.js';
import { StatusCheckNode } from './nodes/status-check.node.js';

/**
 *   START → guardInput ──blocked──► END
 *              │
 *           routeIntent ─┬─ status_check ──► statusCheck ──► END
 *                        ├─ general/off_topic ► generalReply ► END
 *                        └─ new_complaint ──► extractDetails
 *                                                │
 *                               missing fields? ─┼─ yes ► askMissing ► END   (loop: next message comes back here)
 *                                                └─ no ──► classify ► checkDuplicates ► createDraft ► humanReview ⏸
 *                                                                                                     │
 *                                                       edit ◄── (back to guardInput) ───────────────┤
 *                                                       submitted / discard ──► finalize ► END ◄─────┘
 */
@Injectable()
export class AgentGraphFactory {
  constructor(
    @Inject(CHECKPOINTER) private readonly checkpointer: BaseCheckpointSaver,
    private readonly guardInput: GuardInputNode,
    private readonly routeIntent: RouteIntentNode,
    private readonly extractDetails: ExtractDetailsNode,
    private readonly askMissing: AskMissingNode,
    private readonly classify: ClassifyNode,
    private readonly checkDuplicates: CheckDuplicatesNode,
    private readonly createDraft: CreateDraftNode,
    private readonly humanReview: HumanReviewNode,
    private readonly finalize: FinalizeNode,
    private readonly statusCheck: StatusCheckNode,
    private readonly generalReply: GeneralReplyNode,
  ) {}

  build() {
    return new StateGraph(AgentState)
      .addNode('guardInput', (s) => this.guardInput.run(s))
      .addNode('routeIntent', (s) => this.routeIntent.run(s))
      .addNode('extractDetails', (s) => this.extractDetails.run(s))
      .addNode('askMissing', (s) => this.askMissing.run(s))
      .addNode('classify', (s) => this.classify.run(s))
      .addNode('checkDuplicates', (s) => this.checkDuplicates.run(s))
      .addNode('createDraft', (s, config) => this.createDraft.run(s, config))
      .addNode(REVIEW_NODE, (s: AgentStateType) => this.humanReview.run(s), { ends: ['guardInput', 'finalize'] })
      .addNode('finalize', (s) => this.finalize.run(s))
      .addNode('statusCheck', (s) => this.statusCheck.run(s))
      .addNode('generalReply', (s) => this.generalReply.run(s))

      .addEdge(START, 'guardInput')
      .addConditionalEdges('guardInput', (s: AgentStateType) => (s.blocked ? END : 'routeIntent'), [
        END,
        'routeIntent',
      ])
      .addConditionalEdges(
        'routeIntent',
        (s: AgentStateType) => {
          if (s.intent === 'status_check') return 'statusCheck';
          if (s.intent === 'new_complaint') return 'extractDetails';
          // While a draft is waiting for review, any reply counts as an edit to it
          return s.draftId ? 'extractDetails' : 'generalReply';
        },
        ['statusCheck', 'extractDetails', 'generalReply'],
      )
      .addConditionalEdges(
        'extractDetails',
        (s: AgentStateType) => (ExtractDetailsNode.missingFields(s.draft).length ? 'askMissing' : 'classify'),
        ['askMissing', 'classify'],
      )
      .addEdge('classify', 'checkDuplicates')
      .addEdge('checkDuplicates', 'createDraft')
      .addConditionalEdges('createDraft', (s: AgentStateType) => (s.draftId ? REVIEW_NODE : END), [
        REVIEW_NODE,
        END,
      ])
      .addEdge('askMissing', END)
      .addEdge('statusCheck', END)
      .addEdge('generalReply', END)
      .addEdge('finalize', END)
      .compile({ checkpointer: this.checkpointer });
  }
}

export type AgentGraph = ReturnType<AgentGraphFactory['build']>;
