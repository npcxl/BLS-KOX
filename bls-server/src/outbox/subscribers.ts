/**
 * Outbox Subscribers 注册示例
 *
 * ========================================
 * 重要: At-Least-Once 语义与幂等性要求
 * ========================================
 *
 * 当前执行模型:
 *   Event → Handler A 成功, Handler B 成功, Handler C 失败
 *   → 整个 Event markFailed → Retry → A、B、C 全部重新执行
 *
 * 因此每个 Subscriber Handler 必须支持幂等:
 *   - 通过 event.eventId 做去重 (如已处理过则跳过)
 *   - 通过业务唯一键做幂等检查
 *   - 避免副作用重复 (如多次发送通知、多次扣款等)
 *
 * 详细说明: docs/outbox.md
 */
import { outboxPublisher } from './outbox-publisher';
import { EventTypes } from './outbox';
import type { OutboxEvent } from './outbox';
import { logger } from '../core/logger';

/**
 * EVENT_SERVICE_PUBLISH: 重试发送失败事件到 event-service
 *
 * 幂等保证：event-service 的 POST /internal/events 以 eventId 为主键，
 * INSERT 重复时 MySQL 报 duplicate key 错误，event-service 静默跳过。
 */
const EVENT_SERVICE_URL = (process.env.EVENT_SERVICE_URL ?? '').replace(/\/+$/, '');
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? '';
const EVENT_SERVICE_PUBLISH = 'EVENT_SERVICE_PUBLISH';

async function retryPublishToEventService(event: OutboxEvent): Promise<void> {
  if (!EVENT_SERVICE_URL) {
    logger.debug('[subscriber:event-publish] EVENT_SERVICE_URL not configured, skipping');
    return;
  }

  const payload = event.payload as Record<string, unknown>;
  const events = payload?.events as any[] | undefined;

  if (!events || events.length === 0) {
    logger.warn('[subscriber:event-publish] no events in payload, marking as published');
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
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
      throw new Error(`event-service returned ${response.status}: ${response.statusText}`);
    }

    logger.info('[subscriber:event-publish] event retry published successfully', {
      eventId: event.eventId,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** 注册所有 Outbox 订阅者 (在 app.ts 启动前调用) */
export function registerOutboxSubscribers(): void {
  // ====== EVENT_SERVICE_PUBLISH: 事件服务重试 ======
  outboxPublisher.on(EVENT_SERVICE_PUBLISH, async (event: OutboxEvent) => {
    logger.info('[subscriber] EVENT_SERVICE_PUBLISH retry', { eventId: event.eventId });
    await retryPublishToEventService(event);
  });

  // USER_CREATED: 用户创建事件 (示例)
  outboxPublisher.on(EventTypes.USER_CREATED, async (event: OutboxEvent) => {
    logger.info('[subscriber] USER_CREATED', { eventId: event.eventId, username: event.payload?.username });

    // 幂等实现示例:
    //   1. 用 event.eventId 校验是否已处理
    //   2. 处理业务逻辑 (如发送欢迎邮件、初始化用户空间等)
    //   3. 标记已处理 (如写入 event_handled 表)

    // TODO: 实际业务逻辑替换此处
  });

  // FILE_UPLOADED: 文件上传事件
  outboxPublisher.on(EventTypes.FILE_UPLOADED, async (event: OutboxEvent) => {
    logger.info('[subscriber] FILE_UPLOADED', { eventId: event.eventId });

    // TODO: 如触发病毒扫描、缩略图生成等
  });

  // ORDER_CREATED: 订单创建事件
  outboxPublisher.on(EventTypes.ORDER_CREATED, async (event: OutboxEvent) => {
    logger.info('[subscriber] ORDER_CREATED', { eventId: event.eventId });

    // TODO: 如库存扣减、通知发货等
  });

  // SESSION_REVOKED: 会话吊销事件
  outboxPublisher.on(EventTypes.SESSION_REVOKED, async (event: OutboxEvent) => {
    logger.info('[subscriber] SESSION_REVOKED', { eventId: event.eventId });

    // TODO: 如清理 Redis 中对应 session
  });

  logger.info('[outbox] subscribers registered');
}
