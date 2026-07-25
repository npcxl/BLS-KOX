import type { StepKey, ServiceName } from './release.types';

/** 发布步骤顺序定义 */
export const RELEASE_STEPS: Array<{ key: StepKey; name: string; order: number }> = [
  { key: 'validate', name: '参数校验', order: 1 },
  { key: 'lock', name: '获取发布锁', order: 2 },
  { key: 'backup', name: '环境备份', order: 3 },
  { key: 'pull_images', name: '拉取镜像', order: 4 },
  { key: 'update_services', name: '更新服务', order: 5 },
  { key: 'wait_services', name: '等待服务就绪', order: 6 },
  { key: 'health_check', name: '健康检查', order: 7 },
  { key: 'business_check', name: '业务验证', order: 8 },
  { key: 'complete', name: '发布完成', order: 9 },
];

/** 回滚步骤 */
export const ROLLBACK_STEPS: Array<{ key: StepKey; name: string; order: number }> = [
  { key: 'rollback', name: '回滚服务', order: 1 },
  { key: 'wait_services', name: '等待服务就绪', order: 2 },
  { key: 'health_check', name: '健康检查', order: 3 },
  { key: 'complete', name: '回滚完成', order: 4 },
];

/** 服务白名单 */
export const SERVICE_ALLOWLIST: ServiceName[] = [
  'bls-admin',
  'bls-server',
  'bls-ai-service',
  'bls-event-service',
  'bls-java-server',
];

/** 环境白名单 */
export const ENVIRONMENT_ALLOWLIST = ['production', 'staging'] as const;

/** 任务状态流转图 */
export const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['checking', 'cancelled'],
  checking: ['waiting_approval', 'running', 'failed', 'cancelled'],
  waiting_approval: ['running', 'cancelled'],
  running: ['success', 'failed', 'cancelled'],
  success: [],
  failed: ['rolling_back'],
  rolling_back: ['rolled_back', 'failed'],
  rolled_back: [],
  cancelled: [],
};

/** 步骤状态流转图 */
export const VALID_STEP_TRANSITIONS: Record<string, string[]> = {
  waiting: ['running', 'skipped'],
  running: ['success', 'failed', 'cancelled'],
  success: [],
  failed: ['rollback'],
  skipped: [],
  rollback: ['success', 'failed'],
  cancelled: [],
};

/** 回调时间窗口（毫秒） */
export const CALLBACK_TIME_WINDOW_MS = 5 * 60 * 1000; // 5分钟

/** 版本缓存 TTL */
export const VERSION_CACHE_TTL = 60_000; // 1分钟

/** 发布锁前缀 */
export const RELEASE_LOCK_PREFIX = 'ops:release:lock:';

/** Nonce 缓存前缀 */
export const RELEASE_NONCE_PREFIX = 'ops:release:nonce:';

/** 版本列表缓存 Key */
export const VERSION_LIST_CACHE_KEY = 'ops:release:versions';

/** 当前任务缓存 Key */
export const RELEASE_CURRENT_TASK_KEY = 'ops:release:current:';
