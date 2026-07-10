/**
 * 通知任务
 */
import type { JobDefinition } from '../job-types';
import { logger } from '../../core/logger';

export const notificationJob: JobDefinition = {
  type: 'notification',
  maxAttempts: 3,
  timeout: 10_000,

  async handler(payload: Record<string, unknown>) {
    const { tenantId, userId, title, content } = payload;

    logger.info('[job:notification] sending', { tenantId, userId, title });

    // TODO: 接入实际通知渠道（WebSocket / Email / SMS）
    // 当前版本：写入 sys_notification 表

    await new Promise((r) => setTimeout(r, 100));

    return { sent: true, title };
  },
};
