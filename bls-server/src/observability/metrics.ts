/**
 * 轻量级 Metrics Registry（Prometheus 格式）
 *
 * 避免引入重量级 SDK，提供 Counter / Gauge / Histogram 三大类型。
 * GET /api/metrics 输出 Prometheus text format。
 */

interface MetricLabel { name: string; value: string; }

class Counter {
  private values = new Map<string, number>();
  constructor(
    public name: string,
    public help: string,
    public labelNames: string[] = [],
  ) {}

  inc(labels: Record<string, string> = {}, value = 1) {
    const key = this.keyOf(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  private keyOf(labels: Record<string, string>) {
    return this.labelNames.map((n) => `${n}=${labels[n] ?? ''}`).join(',');
  }

  export(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [k, v] of this.values) {
      lines.push(`${this.name}{${k}} ${v}`);
    }
    return lines.join('\n');
  }
}

class Gauge {
  private values = new Map<string, number>();
  constructor(
    public name: string,
    public help: string,
    public labelNames: string[] = [],
  ) {}

  set(labels: Record<string, string> = {}, value: number) {
    this.values.set(this.keyOf(labels), value);
  }

  inc(labels: Record<string, string> = {}, value = 1) {
    const key = this.keyOf(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }

  dec(labels: Record<string, string> = {}, value = 1) { this.inc(labels, -value); }

  private keyOf(labels: Record<string, string>) {
    return this.labelNames.map((n) => `${n}=${labels[n] ?? ''}`).join(',');
  }

  export(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const [k, v] of this.values) {
      lines.push(`${this.name}{${k}} ${v}`);
    }
    return lines.join('\n');
  }
}

class Histogram {
  private buckets: number[];
  private data = new Map<string, number[]>();
  private sum = new Map<string, number>();
  private count = new Map<string, number>();

  constructor(
    public name: string,
    public help: string,
    buckets: number[],
    public labelNames: string[] = [],
  ) {
    this.buckets = buckets.sort((a, b) => a - b);
  }

  observe(labels: Record<string, string> = {}, value: number) {
    const key = this.keyOf(labels);
    if (!this.data.has(key)) this.data.set(key, new Array(this.buckets.length + 1).fill(0));
    const counts = this.data.get(key)!;
    const idx = this.buckets.findIndex((b) => value <= b);
    counts[idx === -1 ? this.buckets.length : idx]++;
    this.sum.set(key, (this.sum.get(key) ?? 0) + value);
    this.count.set(key, (this.count.get(key) ?? 0) + 1);
  }

  private keyOf(labels: Record<string, string>) {
    return this.labelNames.map((n) => `${n}=${labels[n] ?? ''}`).join(',');
  }

  export(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [k, counts] of this.data) {
      let acc = 0;
      for (let i = 0; i < this.buckets.length; i++) {
        acc += counts[i];
        lines.push(`${this.name}_bucket{${k},le="${this.buckets[i]}"} ${acc}`);
      }
      lines.push(`${this.name}_bucket{${k},le="+Inf"} ${acc + (counts[this.buckets.length] ?? 0)}`);
      lines.push(`${this.name}_sum{${k}} ${this.sum.get(k) ?? 0}`);
      lines.push(`${this.name}_count{${k}} ${this.count.get(k) ?? 0}`);
    }
    return lines.join('\n');
  }
}

// ========== HTTP Metrics ==========

export const httpRequestsTotal = new Counter(
  'http_requests_total',
  'Total HTTP requests',
  ['method', 'route', 'status'],
);

export const httpRequestDurationSeconds = new Histogram(
  'http_request_duration_seconds',
  'HTTP request duration in seconds',
  [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  ['method', 'route'],
);

export const httpRequestErrorsTotal = new Counter(
  'http_request_errors_total',
  'Total HTTP request errors',
  ['method', 'route'],
);

// ========== Security Metrics ==========

export const securityEventsTotal = new Counter(
  'security_events_total',
  'Total security events',
  ['event_type', 'risk_level'],
);

export const rateLimitRejectedTotal = new Counter(
  'rate_limit_rejected_total',
  'Rate limit rejections',
  ['path', 'dimension'],
);

export const replayRejectedTotal = new Counter(
  'replay_rejected_total',
  'Replay attack rejections',
  ['reason'],
);

export const idempotencyConflictTotal = new Counter(
  'idempotency_conflict_total',
  'Idempotency conflicts',
  ['type'],
);

export const refreshReuseDetectedTotal = new Counter(
  'refresh_reuse_detected_total',
  'Refresh token reuse detections',
);

export const crossTenantAccessTotal = new Counter(
  'cross_tenant_access_total',
  'Cross-tenant access attempts',
);

export const loginFailedTotal = new Counter(
  'login_failed_total',
  'Failed login attempts',
);

// ========== Infrastructure Metrics ==========

export const dbQueryErrorsTotal = new Counter(
  'db_query_errors_total',
  'Database query errors',
);

export const redisOperationErrorsTotal = new Counter(
  'redis_operation_errors_total',
  'Redis operation errors',
);

export const activeSessions = new Gauge(
  'active_sessions',
  'Active user sessions',
);

export const websocketConnections = new Gauge(
  'websocket_connections',
  'Active WebSocket connections',
);

/** 导出所有指标为 Prometheus text format */
export function collectMetrics(): string {
  const all = [
    httpRequestsTotal,
    httpRequestDurationSeconds,
    httpRequestErrorsTotal,
    securityEventsTotal,
    rateLimitRejectedTotal,
    replayRejectedTotal,
    idempotencyConflictTotal,
    refreshReuseDetectedTotal,
    crossTenantAccessTotal,
    loginFailedTotal,
    dbQueryErrorsTotal,
    redisOperationErrorsTotal,
    activeSessions,
    websocketConnections,
  ];
  return all.map((m) => m.export()).filter(Boolean).join('\n\n') + '\n';
}
