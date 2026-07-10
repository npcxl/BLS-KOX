/**
 * Outbox Publisher
 *
 * 轮询 outbox_event 表，将 pending 事件分发到 Subscriber。
 */
import { fetchPending, markPublished } from './outbox';
import type { OutboxEvent } from './outbox';
import { logger } from '../core/logger';

const POLL_INTERVAL = 3_000;

type EventHandler = (event: OutboxEvent) => Promise<void>;

export class OutboxPublisher {
  private subscribers = new Map<string, EventHandler[]>();
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  on(eventType: string, handler: EventHandler): this {
    const handlers = this.subscribers.get(eventType) ?? [];
    handlers.push(handler);
    this.subscribers.set(eventType, handlers);
    return this;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    logger.info('[outbox-publisher] started');
    this.poll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    logger.info('[outbox-publisher] stopped');
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const event = await fetchPending();
        if (event) { this.dispatch(event).catch(() => {}); }
      } catch (err) {
        logger.error('[outbox-publisher] poll error', { error: String(err) });
      }
      await new Promise<void>((resolve) => {
        this.timer = setTimeout(() => { this.timer = null; resolve(); }, POLL_INTERVAL);
      });
    }
  }

  private async dispatch(event: OutboxEvent): Promise<void> {
    const handlers = this.subscribers.get(event.eventType) ?? [];
    if (handlers.length === 0) {
      await markPublished(event.eventId);
      return;
    }
    for (const handler of handlers) {
      try { await handler(event); } catch (err: any) {
        logger.error('[outbox-publisher] handler error', { eventType: event.eventType, error: String(err) });
      }
    }
    await markPublished(event.eventId);
  }
}

export const outboxPublisher = new OutboxPublisher();
