export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

/** The envelope every event travels in, whatever the event bus. */
export interface DomainEvent<TPayload = unknown> {
  /** Outbox event id — consumers use it for idempotency */
  id: string;
  /** e.g. "complaint.created" */
  type: string;
  /** Partition key — the complaint id, so one complaint's events stay in order */
  key: string;
  payload: TPayload;
  occurredAt: string;
}

export interface EventPublisher {
  readonly name: string;
  publish(topic: string, event: DomainEvent): Promise<void>;
  publishBatch(topic: string, events: DomainEvent[]): Promise<void>;
}
