/**
 * P5 Observability — prom-client 统一 Registry
 *
 * 所有指标定义在此文件，使用 prom-client 标准库。
 * GET /api/metrics 通过 metricsRegistry.metrics() 输出 Prometheus exposition format。
 */

import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

export const metricsRegistry = new Registry();

// 默认 Node.js 指标（内存、GC、事件循环等）
collectDefaultMetrics({ register: metricsRegistry, prefix: 'bls_kox_' });

// ========== HTTP ==========

export const httpRequestsTotal = new Counter({
  name: 'bls_kox_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'bls_kox_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

export const httpRequestErrorsTotal = new Counter({
  name: 'bls_kox_http_request_errors_total',
  help: 'Total HTTP request errors',
  labelNames: ['method', 'route'],
  registers: [metricsRegistry],
});

// ========== Security ==========

export const securityEventsTotal = new Counter({
  name: 'bls_kox_security_events_total',
  help: 'Total security events',
  labelNames: ['event_type', 'risk_level'],
  registers: [metricsRegistry],
});

export const rateLimitRejectedTotal = new Counter({
  name: 'bls_kox_rate_limit_rejected_total',
  help: 'Rate limit rejections',
  labelNames: ['route', 'dimension'],
  registers: [metricsRegistry],
});

export const replayRejectedTotal = new Counter({
  name: 'bls_kox_replay_rejected_total',
  help: 'Replay attack rejections',
  labelNames: ['reason'],
  registers: [metricsRegistry],
});

export const idempotencyConflictTotal = new Counter({
  name: 'bls_kox_idempotency_conflict_total',
  help: 'Idempotency conflicts',
  labelNames: ['type'],
  registers: [metricsRegistry],
});

export const refreshReuseDetectedTotal = new Counter({
  name: 'bls_kox_refresh_reuse_detected_total',
  help: 'Refresh token reuse detections',
  registers: [metricsRegistry],
});

export const crossTenantAccessTotal = new Counter({
  name: 'bls_kox_cross_tenant_access_total',
  help: 'Cross-tenant access attempts',
  registers: [metricsRegistry],
});

export const loginFailedTotal = new Counter({
  name: 'bls_kox_login_failed_total',
  help: 'Failed login attempts',
  registers: [metricsRegistry],
});

// ========== Database ==========

export const dbQueryDurationSeconds = new Histogram({
  name: 'bls_kox_db_query_duration_seconds',
  help: 'Database query duration',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [metricsRegistry],
});

export const dbQueryErrorsTotal = new Counter({
  name: 'bls_kox_db_query_errors_total',
  help: 'Database query errors',
  labelNames: ['operation'],
  registers: [metricsRegistry],
});

// ========== Redis ==========

export const redisOperationDurationSeconds = new Histogram({
  name: 'bls_kox_redis_operation_duration_seconds',
  help: 'Redis operation duration',
  labelNames: ['operation'],
  buckets: [0.0001, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  registers: [metricsRegistry],
});

export const redisOperationErrorsTotal = new Counter({
  name: 'bls_kox_redis_operation_errors_total',
  help: 'Redis operation errors',
  labelNames: ['operation'],
  registers: [metricsRegistry],
});

// ========== Session / WebSocket ==========

export const activeSessions = new Gauge({
  name: 'bls_kox_active_sessions',
  help: 'Active user sessions',
  registers: [metricsRegistry],
  async collect() {
    // 每次 Prometheus 抓取时统计 Redis 中活跃 session-index 数量
    try {
      const { getRedisClient } = require('../shared/utils/redis');
      const client = getRedisClient();
      if (client) {
        const keys = await client.keys('session-index:*');
        let total = 0;
        for (const k of keys) {
          total += await client.scard(k);
        }
        this.set(total);
      }
    } catch {
      // Redis 不可用时保持上次值
    }
  },
});

export const websocketConnections = new Gauge({
  name: 'bls_kox_websocket_connections',
  help: 'Active WebSocket connections',
  registers: [metricsRegistry],
});
