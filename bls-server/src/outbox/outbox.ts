/**
 * Outbox Pattern
 *
 * 在同一个数据库事务中写入业务数据 + 事件记录。
 * Publisher 异步读取 pending 事件并分发。
 */
import { generateSnowflakeId } from '../shared/utils/snowflake';
import { logger } from '../core/logger';

const TABLE = 'outbox_event';

export interface OutboxEvent {
  eventId: string;
  tenantId: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'published' | 'failed' | 'dead';
  retryCount: number;
  createdAt: Date;
  publishedAt?: Date;
}

/** 事件类型常量 */
export const EventTypes = {
  USER_CREATED: 'USER_CREATED',
  USER_DISABLED: 'USER_DISABLED',
  ORDER_CREATED: 'ORDER_CREATED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  FILE_UPLOADED: 'FILE_UPLOADED',
  SESSION_REVOKED: 'SESSION_REVOKED',
} as const;

/** 在事务中写入事件（与业务操作在同一个事务内） */
export async function appendEvent(
  db: any,
  params: {
    tenantId: string;
    eventType: string;
    aggregateType?: string;
    aggregateId?: string;
    payload?: Record<string, unknown>;
  },
): Promise<string> {
  const eventId = generateSnowflakeId().toString();
  const now = new Date();

  await db
    .insertInto(TABLE)
    .values({
      event_id: eventId,
      tenant_id: params.tenantId,
      event_type: params.eventType,
      aggregate_type: params.aggregateType ?? null,
      aggregate_id: params.aggregateId ?? null,
      payload_json: JSON.stringify(params.payload ?? {}),
      status: 'pending',
      retry_count: 0,
      next_retry_at: now,
      created_at: now,
      published_at: null,
    } as any)
    .execute();

  return eventId;
}

/** 获取一条待发布事件 */
export async function fetchPending(): Promise<OutboxEvent | null> {
  const { getDb } = require('../core/database');
  const db = (await getDb()) as any;

  const row = await db
    .selectFrom(TABLE)
    .selectAll()
    .where('status', 'in', ['pending', 'failed'])
    .where('next_retry_at', '<=', new Date())
    .orderBy('created_at', 'asc')
    .limit(1)
    .forUpdate()
    .skipLocked()
    .executeTakeFirst();

  if (!row) return null;

  await db
    .updateTable(TABLE)
    .set({ status: 'processing', retry_count: (row.retry_count ?? 0) + 1 } as any)
    .where('event_id', '=', row.event_id)
    .execute();

  return mapRow(row);
}

/** 标记发布成功 */
export async function markPublished(eventId: string): Promise<void> {
  const { getDb } = require('../core/database');
  const db = await getDb();
  await db
    .updateTable(TABLE)
    .set({ status: 'published', published_at: new Date() } as any)
    .where('event_id', '=', eventId)
    .execute();
}

/** 标记失败（含重试逻辑） */
export async function markFailed(
  eventId: string,
  record: OutboxEvent,
  error: string,
): Promise<void> {
  const { getDb } = require('../core/database');
  const db = await getDb();
  const exceeded = record.retryCount + 1 >= 3;

  if (exceeded) {
    await db
      .updateTable(TABLE)
      .set({ status: 'dead' } as any)
      .where('event_id', '=', eventId)
      .execute();
    logger.warn('[outbox] dead letter', { eventId, eventType: record.eventType, error });
  } else {
    const backoff = Math.pow(2, record.retryCount) * 1000;
    await db
      .updateTable(TABLE)
      .set({ status: 'pending', next_retry_at: new Date(Date.now() + backoff) } as any)
      .where('event_id', '=', eventId)
      .execute();
    logger.info('[outbox] retry', { eventId, nextRetry: `${backoff / 1000}s` });
  }
}

function mapRow(row: any): OutboxEvent {
  return {
    eventId: String(row.event_id),
    tenantId: String(row.tenant_id),
    eventType: String(row.event_type),
    aggregateType: row.aggregate_type ? String(row.aggregate_type) : undefined,
    aggregateId: row.aggregate_id ? String(row.aggregate_id) : undefined,
    payload: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : (row.payload_json ?? {}),
    status: row.status,
    retryCount: Number(row.retry_count ?? 0),
    createdAt: new Date(row.created_at),
    publishedAt: row.published_at ? new Date(row.published_at) : undefined,
  };
}
