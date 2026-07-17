/**
 * EventClient — 向 bls-event-service 发送事件
 *
 * 设计要点：
 * - fire-and-forget：调用失败不阻塞主业务
 * - 失败时写入 Outbox（outbox_event 表），后台重试
 * - event-service 可选启动：未配置 EVENT_SERVICE_URL 时静默跳过
 * - 超时 3 秒，避免阻塞
 */
import { logger } from '../core/logger';
import { getDb } from '../core/database';
import { generateSnowflakeId } from '../shared/utils/snowflake';

const EVENT_SERVICE_URL = (process.env.EVENT_SERVICE_URL ?? '').replace(/\/+$/, '');
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';
const REQUEST_TIMEOUT = 3_000;

export interface EventPayload {
  eventId?: string;
  tenantId: string;
  userId?: string | null;
  username?: string | null;
  eventType: string;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  sourceService?: string;
  sourceModule?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  requestId?: string | null;
  traceId?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  detailJson?: unknown;
  createdAt?: string;
}

/** 发送事件到 event-service */
async function sendEventsToService(events: EventPayload[]): Promise<boolean> {
  if (!EVENT_SERVICE_URL) {
    return false;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${EVENT_SERVICE_URL}/internal/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': INTERNAL_SECRET,
      },
      body: JSON.stringify({ events }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      logger.warn('[event-client] event-service returned non-ok', {
        status: response.status,
        statusText: response.statusText,
      });
      return false;
    }

    return true;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn('[event-client] event-service request timeout');
    } else {
      logger.warn('[event-client] event-service unreachable', {
        error: error?.message ?? String(error),
      });
    }
    return false;
  }
}

/** 将失败事件写入 Outbox，供后台重试 */
async function writeToOutbox(events: EventPayload[]): Promise<void> {
  try {
    const db = await getDb();
    for (const event of events) {
      const eventId = event.eventId || generateSnowflakeId().toString();
      await db.insertInto('outbox_event').values({
        event_id: eventId,
        tenant_id: event.tenantId,
        event_type: 'EVENT_SERVICE_PUBLISH',
        aggregate_type: 'event',
        aggregate_id: eventId,
        payload_json: JSON.stringify({ events: [event] }),
        status: 'pending',
        retry_count: 0,
        next_retry_at: new Date(),
        processing_at: null,
        created_at: new Date(),
        published_at: null,
      } as any).execute();
    }
    logger.info('[event-client] events written to outbox', { count: events.length });
  } catch (error) {
    logger.error('[event-client] failed to write events to outbox', {
      error: String(error),
    });
  }
}

/**
 * 发布事件（fire-and-forget）
 * - 优先直接调用 event-service
 * - 失败则写入 Outbox 后台重试
 * - 不阻塞、不抛错
 */
export async function publishEvents(events: EventPayload[]): Promise<void> {
  if (!EVENT_SERVICE_URL) {
    logger.debug('[event-client] EVENT_SERVICE_URL not configured, skipping');
    return;
  }

  const enriched = events.map((e) => ({
    ...e,
    eventId: e.eventId || generateSnowflakeId().toString(),
    sourceService: e.sourceService || 'bls-server',
    createdAt: e.createdAt || new Date().toISOString(),
  }));

  const success = await sendEventsToService(enriched);
  if (!success) {
    // 写入 Outbox 重试
    await writeToOutbox(enriched);
  } else {
    logger.debug('[event-client] events published to event-service', { count: enriched.length });
  }
}

/** 快捷方法：发布单个事件 */
export async function publishEvent(event: EventPayload): Promise<void> {
  return publishEvents([event]);
}
