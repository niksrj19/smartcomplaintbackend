import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMBEDDING_PROVIDER, type EmbeddingProvider } from '../../../../ports/embedding.provider.js';
import { AiRepository } from '../../ai.repository.js';
import type { AgentStateType, AgentStateUpdate } from '../agent.state.js';

/**
 * Node 6 — looks for open complaints that describe the same issue (pgvector similarity).
 * Never blocks the citizen: duplicates are shown on the draft card as information.
 */
@Injectable()
export class CheckDuplicatesNode {
  private readonly logger = new Logger(CheckDuplicatesNode.name);

  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly embeddings: EmbeddingProvider,
    private readonly repo: AiRepository,
  ) {}

  async run(state: AgentStateType): Promise<AgentStateUpdate> {
    try {
      const text = `${state.draft.title ?? ''}. ${state.draft.description ?? ''}`;
      const vector = await this.embeddings.embed(text, 'similarity');
      return { duplicates: await this.repo.findSimilarOpenComplaints(vector) };
    } catch (err) {
      this.logger.warn(`Duplicate check skipped: ${(err as Error).message}`);
      return { duplicates: [] };
    }
  }
}
