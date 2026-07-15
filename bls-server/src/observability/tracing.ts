/**
 * OpenTelemetry Tracing — 分布式链路追踪
 *
 * 支持:
 *   - HTTP 请求自动 Span（通过 Koa 中间件）
 *   - DB 查询 Span（通过 database.ts 集成）
 *   - Redis 操作 Span（通过 redis.ts 集成）
 *   - OTLP/gRPC 导出到 Jaeger / Grafana Tempo / Datadog 等后端
 *
 * 配置（通过环境变量）:
 *   OTEL_EXPORTER_OTLP_ENDPOINT — OTLP Collector 地址，默认 http://localhost:4318/v1/traces
 *   OTEL_SERVICE_NAME             — 服务名，默认 bls-kox-server
 *   OTEL_TRACES_ENABLED           — 是否启用 Tracing，默认 true
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { KoaInstrumentation } from '@opentelemetry/instrumentation-koa';
import { MySQL2Instrumentation } from '@opentelemetry/instrumentation-mysql2';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { AlwaysOnSampler } from '@opentelemetry/sdk-trace-base';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { env } from '../config/env';
import { logger } from '../core/logger';

let sdk: NodeSDK | null = null;

export function initTracing(): void {
  const enabled = (process.env.OTEL_TRACES_ENABLED ?? 'true') === 'true';
  if (!enabled) {
    logger.info('[tracing] disabled via OTEL_TRACES_ENABLED');
    return;
  }

  // 仅在开发环境输出诊断日志
  if (env.nodeEnv === 'development') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
  }

  const serviceName = process.env.OTEL_SERVICE_NAME ?? 'bls-kox-server';
  const otlpEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
    'http://localhost:4318/v1/traces';

  const traceExporter = new OTLPTraceExporter({
    url: otlpEndpoint,
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      'deployment.environment': env.nodeEnv,
    }),
    traceExporter,
    sampler: new AlwaysOnSampler(),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) =>
          req.url ? ['/api/health', '/api/metrics', '/api/ready'].includes(req.url) : false,
      }),
      new KoaInstrumentation({
        // suppressInternalInstrumentation: true 在较新版本才支持，先保持默认
      }),
      new MySQL2Instrumentation(),
      new IORedisInstrumentation({
        requireParentSpan: true,
      }),
    ],
  });

  try {
    sdk.start();
    logger.info('[tracing] initialized', { serviceName, otlpEndpoint });
  } catch (err) {
    logger.error('[tracing] failed to start SDK', { error: String(err) });
  }

  // 优雅关闭
  const shutdown = async () => {
    if (!sdk) return;
    try {
      await sdk.shutdown();
      logger.info('[tracing] SDK shut down');
    } catch (err) {
      logger.error('[tracing] SDK shutdown error', { error: String(err) });
    }
  };

  process.on('SIGTERM', () => { shutdown().catch(() => {}); });
  process.on('SIGINT', () => { shutdown().catch(() => {}); });
}

export function getTracer(name: string) {
  const { trace } = require('@opentelemetry/api');
  return trace.getTracer(name);
}
