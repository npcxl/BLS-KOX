/**
 * P7: Outbox Publisher
 *
 * - 轮询 pending 事件
 * - 原子 claim (outbox.ts)
 * - Graceful Shutdown Drain
 * - Handler 失败 → retry/backoff
 */
import { fetchPending, markPublished, markFailed } from './outbox';
import type { OutboxEvent } from './outbox';
import { logger } from '../core/logger';
import { getDb } from '../core/database';


const POLL_INTERVAL = 3_000;
const DRAIN_TIMEOUT = 30_000;

export class OutboxPublisher {
  private subscribers = new Map<string, ((e: OutboxEvent) => Promise<void>)[]>();
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private inflight = new Map<string, Promise<void>>();

  on(eventType: string, handler: (e: OutboxEvent) => Promise<void>): this {
    const list = this.subscribers.get(eventType) ?? [];
    list.push(handler);
    this.subscribers.set(eventType, list);
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
    if (this.inflight.size > 0) {
      logger.info('[outbox-publisher] draining', { inflight: this.inflight.size });
      await Promise.race([Promise.allSettled(this.inflight.values()), new Promise(r => setTimeout(r, DRAIN_TIMEOUT))]);
    }
    logger.info('[outbox-publisher] stopped');
  }

  private async poll(): Promise<void> {
    const db = await getDb();
    while (this.running) {
      try {
        const event = await fetchPending(db);
        if (event) {
          const p = this.dispatch(event).finally(() => this.inflight.delete(event.eventId));
          this.inflight.set(event.eventId, p);
        }
      } catch (err) { logger.error('[outbox-publisher] poll error', { error: String(err) }); }
      await new Promise<void>((resolve) => {
        this.timer = setTimeout(() => { this.timer = null; resolve(); }, POLL_INTERVAL);
      });
    }
  }

  private async dispatch(event: OutboxEvent): Promise<void> {
    const db = await getDb();
    const handlers = this.subscribers.get(event.eventType) ?? [];
    if (handlers.length === 0) { await markPublished(db, event.eventId); return; }

    // At-Least-Once: 同一 eventType 下所有 handler 顺序执行, 任一失败则整体重试.
    // 因此每个 handler 必须幂等 (详见 docs/outbox.md 及 subscribers.ts 注释)
    let failed = false;
    for (const handler of handlers) {
      try { await handler(event); } catch (err: any) {
        logger.error('[outbox-publisher] handler error', { eventType: event.eventType, error: String(err) });
        failed = true;
      }
    }
    if (failed) {
      await markFailed(db, event.eventId, event, 'Handler execution failed');
    } else {
      await markPublished(db, event.eventId);
    }
  }
}

export const outboxPublisher = new OutboxPublisher();
