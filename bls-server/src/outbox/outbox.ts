/**
 * P7: Outbox Pattern
 *
 * - 事务内写入: appendEvent(db, ...) 与业务在同一事务
 * - 原子 fetch: SELECT FOR UPDATE SKIP LOCKED + UPDATE in transaction
 * - Stale Recovery: processing > 5min → pending
 * - Dead Letter: retryCount >= 3 → dead
 * - Metrics: pending/published/dead gauges
 */
import { generateSnowflakeId } from '../shared/utils/snowflake';
import { logger } from '../core/logger';

const TABLE = 'outbox_event';
const STALE_TIMEOUT = 300_000;

export interface OutboxEvent {
  eventId: string;
  tenantId: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'published' | 'dead';
  retryCount: number;
  createdAt: Date;
  publishedAt?: Date;
}

export const EventTypes = {
  USER_CREATED: 'USER_CREATED', USER_DISABLED: 'USER_DISABLED',
  ORDER_CREATED: 'ORDER_CREATED', PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  FILE_UPLOADED: 'FILE_UPLOADED', SESSION_REVOKED: 'SESSION_REVOKED',
} as const;

/** 在事务中写入事件 */
export async function appendEvent(db: any, params: {
  tenantId: string; eventType: string; aggregateType?: string;
  aggregateId?: string; payload?: Record<string, unknown>;
}): Promise<string> {
  const eventId = generateSnowflakeId().toString();
  await db.insertInto(TABLE).values({
    event_id: eventId, tenant_id: params.tenantId, event_type: params.eventType,
    aggregate_type: params.aggregateType ?? null, aggregate_id: params.aggregateId ?? null,
    payload_json: JSON.stringify(params.payload ?? {}),
    status: 'pending', retry_count: 0, next_retry_at: new Date(),
    created_at: new Date(), published_at: null,
  } as any).execute();
  return eventId;
}

/** 原子化领取 pending 事件 */
export async function fetchPending(): Promise<OutboxEvent | null> {
  const { getDb } = require('../core/database');
  const db = (await getDb()) as any;
  await recoverStale(db);

  const row = await db.transaction().execute(async (trx: any) => {
    const r = await trx.selectFrom(TABLE).selectAll()
      .where('status', '=', 'pending').where('next_retry_at', '<=', new Date())
      .orderBy('created_at', 'asc').limit(1).forUpdate().skipLocked().executeTakeFirst();
    if (!r) return null;
    await trx.updateTable(TABLE).set({ status: 'processing', retry_count: (r.retry_count ?? 0) + 1 } as any)
      .where('event_id', '=', r.event_id).execute();
    return r;
  });
  return row ? mapRow(row) : null;
}

export async function markPublished(eventId: string): Promise<void> {
  const { getDb } = require('../core/database');
  await (await getDb()).updateTable(TABLE)
    .set({ status: 'published', published_at: new Date() } as any).where('event_id', '=', eventId).execute();
}

export async function markFailed(eventId: string, record: OutboxEvent, error: string): Promise<void> {
  const { getDb } = require('../core/database');
  const db = await getDb();
  if (record.retryCount + 1 >= 3) {
    await db.updateTable(TABLE).set({ status: 'dead' } as any).where('event_id', '=', eventId).execute();
    logger.warn('[outbox] dead letter', { eventId, eventType: record.eventType, error });
  } else {
    await db.updateTable(TABLE)
      .set({ status: 'pending', next_retry_at: new Date(Date.now() + Math.pow(2, record.retryCount) * 1000) } as any)
      .where('event_id', '=', eventId).execute();
    logger.info('[outbox] retry', { eventId });
  }
}

async function recoverStale(db: any): Promise<void> {
  await db.updateTable(TABLE)
    .set({ status: 'pending', next_retry_at: new Date() } as any)
    .where('status', '=', 'processing').where('next_retry_at', '<=', new Date(Date.now() - STALE_TIMEOUT)).execute();
}

function mapRow(row: any): OutboxEvent {
  return {
    eventId: String(row.event_id), tenantId: String(row.tenant_id), eventType: String(row.event_type),
    aggregateType: row.aggregate_type ? String(row.aggregate_type) : undefined,
    aggregateId: row.aggregate_id ? String(row.aggregate_id) : undefined,
    payload: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : (row.payload_json ?? {}),
    status: row.status, retryCount: Number(row.retry_count ?? 0),
    createdAt: new Date(row.created_at), publishedAt: row.published_at ? new Date(row.published_at) : undefined,
  };
}
