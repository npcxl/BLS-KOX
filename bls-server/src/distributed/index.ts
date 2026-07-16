/**
 * 分布式能力模块统一导出
 *
 * 当前阶段：模块化单体 + 分布式能力预留
 * 不引入注册中心、网关、Nacos、Seata
 */
export { createDistributedLock } from './lock';
export type { LockOptions } from './lock';

export { createIdempotencyService } from './idempotency';
export type { IdempotencyOptions } from './idempotency';

export { createRateLimiter } from './rate-limit';
export type { RateLimitCheck } from './rate-limit';

export { traceMiddleware, getRequestId, getTraceId } from './trace';
export { REQUEST_ID_HEADER, TRACE_ID_HEADER } from './trace';
