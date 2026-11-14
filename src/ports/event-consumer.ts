import type { DomainEvent } from './event-publisher.js';

export const EVENT_CONSUMER = Symbol('EVENT_CONSUMER');

export interface EventMeta {
  topic: string;
  partition?: number;
  offset?: string;
}

export type EventHandler = (event: DomainEvent, meta: EventMeta) => Promise<void>;

export interface SubscribeOptions {
  topics: string[];
  /** Each consumer service gets its own group, so each receives every event */
  groupId: string;
  handler: EventHandler;
}

export interface EventConsumer {
  readonly name: string;
  subscribe(options: SubscribeOptions): Promise<void>;
}
