import { describe, it, expect } from 'vitest';
import { metricsRegistry } from '../metrics';

describe('Metrics Registry', () => {
  it('should register HTTP request counter', () => {
    const m = metricsRegistry.getSingleMetric('bls_kox_http_requests_total');
    expect(m).toBeDefined();
  });

  it('should register HTTP duration histogram', () => {
    const m = metricsRegistry.getSingleMetric('bls_kox_http_request_duration_seconds');
    expect(m).toBeDefined();
  });

  it('should register security events counter', () => {
    const m = metricsRegistry.getSingleMetric('bls_kox_security_events_total');
    expect(m).toBeDefined();
  });

  it('should register DB query duration histogram', () => {
    const m = metricsRegistry.getSingleMetric('bls_kox_db_query_duration_seconds');
    expect(m).toBeDefined();
  });

  it('should register DB query errors counter', () => {
    const m = metricsRegistry.getSingleMetric('bls_kox_db_query_errors_total');
    expect(m).toBeDefined();
  });

  it('should register Redis operation duration histogram', () => {
    const m = metricsRegistry.getSingleMetric('bls_kox_redis_operation_duration_seconds');
    expect(m).toBeDefined();
  });

  it('should register Redis operation errors counter', () => {
    const m = metricsRegistry.getSingleMetric('bls_kox_redis_operation_errors_total');
    expect(m).toBeDefined();
  });

  it('should register active sessions gauge', () => {
    const m = metricsRegistry.getSingleMetric('bls_kox_active_sessions');
    expect(m).toBeDefined();
  });

  it('should register WebSocket connections gauge', () => {
    const m = metricsRegistry.getSingleMetric('bls_kox_websocket_connections');
    expect(m).toBeDefined();
  });

  it('should export metrics in Prometheus format', async () => {
    const output = await metricsRegistry.metrics();
    expect(output).toContain('bls_kox_http_requests_total');
    expect(output).toContain('# HELP');
  });

  it('should use standard content type', () => {
    expect(metricsRegistry.contentType).toMatch(/text\/plain/);
  });

  it('should include Node.js default metrics', async () => {
    const output = await metricsRegistry.metrics();
    expect(output).toContain('bls_kox_nodejs_');
  });
});
