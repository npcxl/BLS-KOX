import {
  Registry,
  Counter,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: 'bls_event_' });

// ========== Event 接收指标 ==========

export const eventsReceivedTotal = new Counter({
  name: 'bls_event_events_received_total',
  help: 'Total events received via /internal/events',
  labelNames: ['event_type'],
  registers: [metricsRegistry],
});

export const eventsWriteSuccessTotal = new Counter({
  name: 'bls_event_events_write_success_total',
  help: 'Total events successfully written to DB',
  labelNames: ['event_type'],
  registers: [metricsRegistry],
});

export const eventsWriteFailedTotal = new Counter({
  name: 'bls_event_events_write_failed_total',
  help: 'Total events failed to write to DB',
  labelNames: ['event_type'],
  registers: [metricsRegistry],
});

export const eventsPending = new Gauge({
  name: 'bls_event_events_pending',
  help: 'Pending events count in sys_event_log (last 24h)',
  registers: [metricsRegistry],
  async collect() {
    try {
      const { query } = await import('../core/database.js');
      const rows = await query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM sys_event_log WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
      );
      this.set(Number(rows[0]?.cnt ?? 0));
    } catch { /* DB 不可用时保持上次值 */ }
  },
});

export const dbConnectionStatus = new Gauge({
  name: 'bls_event_db_connection_status',
  help: 'Database connection status (1=up, 0=down)',
  registers: [metricsRegistry],
});
