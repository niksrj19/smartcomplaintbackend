import { GoogleGenAI } from '@google/genai';
import { ProviderError } from '../../common/errors/provider.error.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import {
  EMBEDDING_DIMENSIONS,
  type EmbeddingProvider,
  type EmbeddingTask,
} from '../../ports/embedding.provider.js';

const TASK_TYPES: Record<EmbeddingTask, string> = {
  document: 'RETRIEVAL_DOCUMENT',
  query: 'RETRIEVAL_QUERY',
  similarity: 'SEMANTIC_SIMILARITY',
};

/** Gemini allows up to 100 texts per embedding request */
const BATCH_SIZE = 100;

export class GeminiEmbeddingAdapter implements EmbeddingProvider {
  readonly name = 'gemini';
  readonly dimensions = EMBEDDING_DIMENSIONS;
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(config: AppConfigService) {
    this.client = new GoogleGenAI({ apiKey: config.gemini.apiKey });
    this.model = config.gemini.embeddingModel;
  }

  async embed(text: string, task: EmbeddingTask = 'document'): Promise<number[]> {
    const [vector] = await this.embedMany([text], task);
    return vector;
  }

  async embedMany(texts: string[], task: EmbeddingTask = 'document'): Promise<number[][]> {
    if (texts.length === 0) return [];
    const results: number[][] = [];

    try {
      for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const response = await this.client.models.embedContent({
          model: this.model,
          contents: batch,
          config: { taskType: TASK_TYPES[task], outputDimensionality: this.dimensions },
        });

        const embeddings = response.embeddings ?? [];
        if (embeddings.length !== batch.length) {
          throw new Error(`expected ${batch.length} embeddings, got ${embeddings.length}`);
        }
        for (const e of embeddings) {
          const values = e.values ?? [];
          if (values.length !== this.dimensions) {
            throw new Error(`expected ${this.dimensions} dimensions, got ${values.length}`);
          }
          results.push(this.normalize(values));
        }
      }
      return results;
    } catch (err) {
      throw new ProviderError(this.name, 'embed', err);
    }
  }

  /** Gemini only normalises full-size vectors; reduced (768) vectors must be normalised for cosine search */
  private normalize(values: number[]): number[] {
    const norm = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0));
    return norm === 0 ? values : values.map((v) => v / norm);
  }
}
