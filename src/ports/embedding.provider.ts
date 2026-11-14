export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

/** Must match vector(768) in prisma/schema.prisma */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * document   → text being stored (complaints, department descriptions)
 * query      → text being searched with
 * similarity → comparing two texts directly (duplicate detection)
 */
export type EmbeddingTask = 'document' | 'query' | 'similarity';

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(text: string, task?: EmbeddingTask): Promise<number[]>;
  embedMany(texts: string[], task?: EmbeddingTask): Promise<number[][]>;
}
