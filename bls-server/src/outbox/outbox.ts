/**
 * P7: Outbox Pattern 核心
 *
 * 设计要点:
 * - 事务内写入: appendEvent(db, ...) 与业务共享同一个 trx, 保证原子性
 * - 原子领取: fetchPending 在事务内 SELECT ... FOR UPDATE SKIP LOCKED → UPDATE processing
 * - Stale Recovery (P0 修复): 仅依据 processing_at 判断 processing 是否卡死,
 *   不再使用 next_retry_at (next_retry_at 只用于 pending 事件的退避调度)
 * - Dead Letter: retryCount >= 3 → dead
 * - At-Least-Once: 同一 eventType 下所有 handler 顺序执行, 任一失败则整体重试
 * - Metrics: published/dead/retry 计数 + publish 耗时直方图
 */
import { generateSnowflakeId } from '../shared/utils/snowflake';
import { logger } from '../core/logger';
import {
  outboxPublishedTotal,
  outboxDeadTotal,
  outboxRetryTotal,
  outboxPublishDurationSeconds,
} from '../observability/metrics';

const TABLE = 'outbox_event';
const STALE_TIMEOUT = 300_000; // 5 分钟

export interface OutboxEvent {
  eventId: string;
  tenantId: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'published' | 'dead';
  retryCount: number;
  nextRetryAt?: Date;
  processingAt?: Date;
  createdAt: Date;
  publishedAt?: Date;
}

export const EventTypes = {
  USER_CREATED: 'USER_CREATED', USER_DISABLED: 'USER_DISABLED',
  ORDER_CREATED: 'ORDER_CREATED', PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  FILE_UPLOADED: 'FILE_UPLOADED', SESSION_REVOKED: 'SESSION_REVOKED',
} as const;

/** 在事务中写入事件 (与业务共享同一 db/trx) */
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
    processing_at: null, created_at: new Date(), published_at: null,
  } as any).execute();
  return eventId;
}

/** 原子化领取一个 pending 事件 */
export async function fetchPending(db: any): Promise<OutboxEvent | null> {
  await recoverStale(db);

  const row = await db.transaction().execute(async (trx: any) => {
    const r = await trx.selectFrom(TABLE).selectAll()
      .where('status', '=', 'pending').where('next_retry_at', '<=', new Date())
      .orderBy('created_at', 'asc').limit(1).forUpdate().skipLocked().executeTakeFirst();
    if (!r) return null;
    // 领取时记录 processing_at (P0 修复关键): 之后 stale 判定只看 processing_at
    await trx.updateTable(TABLE).set({
      status: 'processing',
      retry_count: (r.retry_count ?? 0) + 1,
      processing_at: new Date(),
      next_retry_at: null,
    } as any).where('event_id', '=', r.event_id).execute();
    // 返回领取后的准确 retryCount, 供 markFailed 判定 dead
    return { ...r, retry_count: (r.retry_count ?? 0) + 1 };
  });
  return row ? mapRow(row) : null;
}

export async function markPublished(db: any, eventId: string): Promise<void> {
  const start = Date.now();
  await db.updateTable(TABLE)
    .set({ status: 'published', published_at: new Date(), processing_at: null } as any)
    .where('event_id', '=', eventId).execute();
  outboxPublishedTotal.inc();
  outboxPublishDurationSeconds.observe((Date.now() - start) / 1000);
}

export async function markFailed(db: any, eventId: string, record: OutboxEvent, error: string): Promise<void> {
  // 使用领取后的准确 retryCount 判定 (retryCount >= 3 进入 dead letter)
  if (record.retryCount >= 3) {
    await db.updateTable(TABLE)
      .set({ status: 'dead', processing_at: null } as any)
      .where('event_id', '=', eventId).execute();
    outboxDeadTotal.inc();
    logger.warn('[outbox] dead letter', { eventId, eventType: record.eventType, error });
  } else {
    const backoffMs = Math.pow(2, record.retryCount) * 1000; // 2s / 4s / 8s ...
    await db.updateTable(TABLE)
      .set({
        status: 'pending',
        next_retry_at: new Date(Date.now() + backoffMs),
        processing_at: null,
      } as any)
      .where('event_id', '=', eventId).execute();
    outboxRetryTotal.inc();
    logger.info('[outbox] retry', { eventId, retryCount: record.retryCount, backoffMs });
  }
}

/**
 * Stale Recovery (P0 修复)
 * 仅依据 processing_at 判断: processing 且 processing_at 超过 STALE_TIMEOUT
 * 视为处理实例崩溃/卡死, 回收到 pending 重新入队。
 * 不再使用 next_retry_at —— pending 阶段 next_retry_at 始终为"可领取时间",
 * 与 processing 是否卡死无关, 用它会把正常处理的事件误判为 stale。
 */
export async function recoverStale(db: any): Promise<void> {
  await db.updateTable(TABLE)
    .set({ status: 'pending', next_retry_at: new Date(), processing_at: null } as any)
    .where('status', '=', 'processing')
    .where('processing_at', '<=', new Date(Date.now() - STALE_TIMEOUT))
    .execute();
}

function mapRow(row: any): OutboxEvent {
  return {
    eventId: String(row.event_id), tenantId: String(row.tenant_id), eventType: String(row.event_type),
    aggregateType: row.aggregate_type ? String(row.aggregate_type) : undefined,
    aggregateId: row.aggregate_id ? String(row.aggregate_id) : undefined,
    payload: typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : (row.payload_json ?? {}),
    status: row.status, retryCount: Number(row.retry_count ?? 0),
    nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : undefined,
    processingAt: row.processing_at ? new Date(row.processing_at) : undefined,
    createdAt: new Date(row.created_at), publishedAt: row.published_at ? new Date(row.published_at) : undefined,
  };
}
