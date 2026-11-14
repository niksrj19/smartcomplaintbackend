export const EVENT_BUS_ADMIN = Symbol('EVENT_BUS_ADMIN');

export interface TopicSpec {
  name: string;
  partitions: number;
}

export interface EventBusAdmin {
  /** Creates any topics that don't exist yet. Safe to call repeatedly. */
  ensureTopics(topics: TopicSpec[]): Promise<void>;
}
