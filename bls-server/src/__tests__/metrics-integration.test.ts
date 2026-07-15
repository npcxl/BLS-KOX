import { describe, it, expect } from 'vitest';
import { metricsRegistry } from '../observability/metrics';

describe('Metrics Integration', () => {
  it('GET /api/metrics should return Prometheus format', async () => {
    const output = await metricsRegistry.metrics();

    // Content type
    expect(metricsRegistry.contentType).toMatch(/text\/plain/);

    // HTTP metrics
    expect(output).toContain('bls_kox_http_requests_total');
    expect(output).toContain('bls_kox_http_request_duration_seconds');
    expect(output).toContain('bls_kox_http_request_errors_total');

    // Security metrics
    expect(output).toContain('bls_kox_security_events_total');
    expect(output).toContain('bls_kox_rate_limit_rejected_total');
    expect(output).toContain('bls_kox_replay_rejected_total');
    expect(output).toContain('bls_kox_idempotency_conflict_total');
    expect(output).toContain('bls_kox_refresh_reuse_detected_total');
    expect(output).toContain('bls_kox_cross_tenant_access_total');
    expect(output).toContain('bls_kox_login_failed_total');

    // DB metrics
    expect(output).toContain('bls_kox_db_query_duration_seconds');
    expect(output).toContain('bls_kox_db_query_errors_total');

    // Redis metrics
    expect(output).toContain('bls_kox_redis_operation_duration_seconds');
    expect(output).toContain('bls_kox_redis_operation_errors_total');

    // Session / WebSocket
    expect(output).toContain('bls_kox_active_sessions');
    expect(output).toContain('bls_kox_websocket_connections');

    // Outbox
    expect(output).toContain('bls_kox_outbox_pending');
    expect(output).toContain('bls_kox_outbox_published_total');
    expect(output).toContain('bls_kox_outbox_dead_total');
    expect(output).toContain('bls_kox_outbox_retry_total');
    expect(output).toContain('bls_kox_outbox_publish_duration_seconds');

    // Node.js default metrics
    expect(output).toContain('bls_kox_nodejs_');
  });

  it('metrics output should have HELP and TYPE lines', async () => {
    const output = await metricsRegistry.metrics();
    expect(output).toContain('# HELP');
    expect(output).toContain('# TYPE');
  });

  it('active sessions gauge should be registered', async () => {
    const m = metricsRegistry.getSingleMetric('bls_kox_active_sessions');
    expect(m).toBeDefined();
  });
});
