/**
 * 套餐权益（feature）与配额（quota）的统一定义（阶段三）
 *
 * 所有功能开关与配额标识都必须在这里声明，避免各接口自定义字符串导致口径不一致。
 */

// ========== 功能权益 ==========

export const FEATURE_KEYS = {
  AI_CHAT: 'feature.ai.chat',
  WEBHOOK: 'feature.webhook',
  OPENAPI: 'feature.openapi',
  AUDIT_EXPORT: 'feature.audit.export',
  CUSTOM_DOMAIN: 'feature.custom_domain',
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export const ALL_FEATURE_KEYS: FeatureKey[] = Object.values(FEATURE_KEYS);

export const FEATURE_LABELS: Record<string, string> = {
  [FEATURE_KEYS.AI_CHAT]: 'AI 对话',
  [FEATURE_KEYS.WEBHOOK]: 'Webhook',
  [FEATURE_KEYS.OPENAPI]: '开放 API',
  [FEATURE_KEYS.AUDIT_EXPORT]: '审计日志导出',
  [FEATURE_KEYS.CUSTOM_DOMAIN]: '自定义域名',
};

// ========== 配额 ==========

export const QUOTA_KEYS = {
  MAX_USERS: 'max_users',
  MAX_STORAGE_BYTES: 'max_storage_bytes',
  MAX_FILES: 'max_files',
  MAX_API_KEYS: 'max_api_keys',
  MAX_WEBHOOKS: 'max_webhooks',
  MAX_AI_TOKENS_MONTHLY: 'max_ai_tokens_monthly',
  MAX_AI_COST_MONTHLY: 'max_ai_cost_monthly',
  MAX_CONCURRENT_JOBS: 'max_concurrent_jobs',
} as const;

export type QuotaKey = (typeof QUOTA_KEYS)[keyof typeof QUOTA_KEYS];

export const ALL_QUOTA_KEYS: QuotaKey[] = Object.values(QUOTA_KEYS);

export type QuotaPeriod = 'total' | 'monthly' | 'daily';

/** 每个配额的计量周期 */
export const QUOTA_PERIODS: Record<QuotaKey, QuotaPeriod> = {
  max_users: 'total',
  max_storage_bytes: 'total',
  max_files: 'total',
  max_api_keys: 'total',
  max_webhooks: 'total',
  max_ai_tokens_monthly: 'monthly',
  max_ai_cost_monthly: 'monthly',
  max_concurrent_jobs: 'total',
};

export const QUOTA_LABELS: Record<string, string> = {
  max_users: '用户数',
  max_storage_bytes: '存储容量（字节）',
  max_files: '文件数',
  max_api_keys: 'API Key 数',
  max_webhooks: 'Webhook 数',
  max_ai_tokens_monthly: 'AI Tokens / 月',
  max_ai_cost_monthly: 'AI 成本 / 月',
  max_concurrent_jobs: '并发任务数',
};

/** 负数表示不限 */
export const QUOTA_UNLIMITED = -1;
