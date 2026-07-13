import Koa from 'koa';
import http from 'http';
import helmet from 'koa-helmet';
import cors from '@koa/cors';
import koaBody from 'koa-body';
import bodyParser from 'koa-bodyparser';
import { env } from './config/env';
import { createRouter } from './core/router';
import { errorHandler } from './middleware/error-handler';
import { logger } from './core/logger';
import { tenantMiddleware } from './middleware/tenant';
import { replayProtectionMiddleware } from './middlewares/replayProtection';
import { httpMetricsMiddleware } from './middleware/http-metrics';
import { requestContextMiddleware } from './core/request-context';
import { rateLimitMiddleware } from './security/rate-limit/middleware';
import { blockedIpMiddleware } from './security/event-center/ip-block-middleware';
import { apiVersion } from './middleware/api-version';
import { openApiAuth } from './middleware/openapi-auth';
import { internalAuth } from './middleware/internal-auth';
import { attachRealtimeWs } from './api/system/realtime/realtime.ws';
import { worker } from './queue/worker';
import { exportJob } from './queue/jobs/export.job';
import { importJob } from './queue/jobs/import.job';
import { notificationJob } from './queue/jobs/notification.job';
import { webhookJob } from './queue/jobs/webhook.job';
import { outboxPublisher } from './outbox/outbox-publisher';
import { registerOutboxSubscribers } from './outbox/subscribers';

export function createApp(): Koa {
  const app = new Koa();

  // 可信代理：仅在 Nginx 前置时开启，Koa 信任 X-Forwarded-* Header
  if (env.trustProxy) app.proxy = true;

  const router = createRouter();

  app.use(errorHandler);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({
    credentials: true,
    origin: (ctx) => {
      const origin = ctx.get('Origin');
      if (!origin) return '';
      if (env.isProduction) {
        return env.corsOrigins.includes(origin) ? origin : '';
      }
      return env.corsOrigin === '*' ? origin : env.corsOrigin;
    },
  }));
  app.use(koaBody({ multipart: true, formidable: { multiples: false } }));
  app.use(bodyParser({ enableTypes: ['json', 'form'] }));
  app.use(requestContextMiddleware);
  app.use(httpMetricsMiddleware);
  app.use(tenantMiddleware);
  app.use(replayProtectionMiddleware());
  app.use(blockedIpMiddleware());
  app.use(rateLimitMiddleware());

  // ====== P11: API Versioning ======

  // 1. 保存原始路径（后续 rewrite 后会变）
  app.use(async (ctx, next) => {
    ctx.state.originalPath = ctx.path;
    await next();
  });

  // 2. /api/v1/* → rewrite 到 /api/*（透明代理到同一套路由）
  app.use(async (ctx, next) => {
    if (ctx.path.startsWith('/api/v1/')) {
      ctx.path = '/api' + ctx.path.slice(7);
    }
    await next();
  });

  // 3. 旧 /api/* 路径 (非 /api/v1/) 返回 Deprecation/Sunset
  app.use(async (ctx, next) => {
    const orig = ctx.state.originalPath as string | undefined;
    if (orig?.startsWith('/api/') && !orig?.startsWith('/api/v1/')) {
      ctx.set('Deprecation', 'true');
      ctx.set('Sunset', new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString());
    }
    await next();
  });

  app.use(apiVersion());
  app.use(router.routes());
  app.use(router.allowedMethods());

  // ====== P11: /openapi/v1 — 独立鉴权 ======
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const KoaRouter = require('koa-router');
  const openapiR = new KoaRouter({ prefix: '/openapi/v1' });
  openapiR.use(openApiAuth());
  openapiR.use(async (ctx: any, next: any) => {
    // rewrite /openapi/v1/... → /api/... 复用现有路由
    ctx.path = '/api' + ctx.path.slice(11);
    await next();
  });
  openapiR.use(router.routes());
  app.use(openapiR.routes());

  // ====== P11: /internal — 内部服务鉴权 ======
  const internalR = new KoaRouter({ prefix: '/internal' });
  internalR.use(internalAuth());
  internalR.get('/health', (ctx: any) => { ctx.body = { status: 'ok' }; });
  internalR.get('/metrics', async (ctx: any) => {
    const { metricsRegistry } = await import('./observability/metrics.js');
    ctx.set('Content-Type', metricsRegistry.contentType);
    ctx.body = await metricsRegistry.metrics();
  });
  app.use(internalR.routes());

  app.on('error', (error) => {
    logger.error('Unhandled application error', { error: String(error) });
  });

  return app;
}

if (require.main === module) {
  // ====== P15: 生产环境安全启动校验 ======
  if (process.env.NODE_ENV === 'production') {
    const issues: string[] = [];
    const WEAK_SECRETS = ['please_change_me', '123456', 'password', 'changeme', ''];
    const PLACEHOLDER_PREFIX = 'CHANGE_TO_';

    const jwt = process.env.JWT_SECRET ?? '';
    if (!jwt || WEAK_SECRETS.some(w => jwt.toLowerCase().includes(w)) || jwt.toUpperCase().startsWith(PLACEHOLDER_PREFIX)) {
      issues.push('JWT_SECRET is missing or too weak (must be >= 32 chars, no common passwords or CHANGE_TO_* placeholder)');
    }
    if (jwt.length < 32) issues.push('JWT_SECRET must be at least 32 characters');

    const dbPwd = process.env.DB_PASSWORD ?? '';
    if (!dbPwd || WEAK_SECRETS.some(w => dbPwd.toLowerCase() === w) || dbPwd.toUpperCase().startsWith(PLACEHOLDER_PREFIX)) {
      issues.push('DB_PASSWORD is missing or too weak (no CHANGE_TO_* placeholder allowed)');
    }

    const redisPwd = process.env.REDIS_PASSWORD ?? '';
    if (!redisPwd || WEAK_SECRETS.some(w => redisPwd.toLowerCase() === w) || redisPwd.toUpperCase().startsWith(PLACEHOLDER_PREFIX)) {
      issues.push('REDIS_PASSWORD is missing or too weak (no CHANGE_TO_* placeholder allowed)');
    }

    if (issues.length > 0) {
      console.error('[security] Production startup blocked due to weak configuration:');
      for (const issue of issues) console.error('  - ' + issue);
      console.error('[security] Please set strong values in .env and restart.');
      process.exit(1);
    }
  }

  const app = createApp();
  const server = http.createServer(app.callback());
  const wss = attachRealtimeWs(server, app);

  server.listen(env.port, env.host, () => {
    logger.info(`${env.appName} started`, { host: env.host, port: env.port, nodeEnv: env.nodeEnv });
  });

  // P6: 注册并启动 Worker
  worker.register(exportJob).register(importJob).register(notificationJob).register(webhookJob).start();

  // P7: 注册订阅者并启动 Outbox Publisher
  registerOutboxSubscribers();
  outboxPublisher.start();

  // ========== P8: DR — 定时自动备份 ==========
  const backupEnabled = (process.env.BACKUP_ENABLED ?? 'false') === 'true';
  if (backupEnabled) {
    const intervalH = parseInt(process.env.BACKUP_INTERVAL_HOURS ?? '24', 10);
    const intervalMs = Math.max(intervalH, 1) * 60 * 60 * 1000;
    logger.info('[backup] enabled', { intervalHours: intervalH });

    const runBackup = () => {
      const { exec } = require('child_process');
      const child = exec('npm run db:backup -- --compress --no-color', {
        cwd: __dirname + '/..',
        timeout: 10 * 60 * 1000,
      });
      child.stdout?.on('data', (d: Buffer) => logger.info('[backup] ' + d.toString().trim()));
      child.stderr?.on('data', (d: Buffer) => logger.warn('[backup] ' + d.toString().trim()));
      child.on('error', (err: Error) => logger.error('[backup] spawn error', { error: err.message }));
    };

    // 启动后延迟 5 分钟做首次备份（避免与启动高峰冲突）
    setTimeout(runBackup, 5 * 60 * 1000);
    setInterval(runBackup, intervalMs);
  }

  // ========== Graceful Shutdown ==========
  let shuttingDown = false;
  const SHUTDOWN_TIMEOUT = 30_000;

  /** 等待 HTTP Server 真正关闭 */
  function closeHttpServer(srv: http.Server): Promise<void> {
    return new Promise((resolve, reject) => {
      srv.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  /** 关闭 WebSocket Server */
  async function closeWebSocketServer(ws: ReturnType<typeof attachRealtimeWs>): Promise<void> {
    if (!ws) return;
    await new Promise<void>((resolve) => {
      // 通知所有客户端关闭
      for (const client of (ws as any).clients || []) {
        try { client.close(1001, 'Server shutting down'); } catch {}
      }
      ws.close(() => resolve());
    });
  }

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // 超时保护：必须在 shutdown() 内启动，确保仅初始调用方持有
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT).unref();

    // 1. Stop accepting new HTTP connections
    try { await closeHttpServer(server); } catch (e) { logger.error('HTTP server close error', { error: String(e) }); }
    logger.info('[shutdown] HTTP server closed');

    // 2. Stop Worker
    try { await worker.stop(); } catch {}
    logger.info('[shutdown] Worker stopped');

    // 2b. Stop Outbox Publisher
    try { await outboxPublisher.stop(); } catch {}
    logger.info('[shutdown] Outbox Publisher stopped');

    // 3. Close WebSocket
    try { await closeWebSocketServer(wss); } catch {}
    logger.info('[shutdown] WebSocket closed');

    // 4. Close Redis
    try {
      const { closeRedis } = require('./shared/utils/redis');
      await closeRedis();
      logger.info('[shutdown] Redis closed');
    } catch {}

    // 4. Close MySQL pools
    try {
      const { closeDatabase } = require('./core/database');
      await closeDatabase();
      logger.info('[shutdown] MySQL pools closed');
    } catch {}

    clearTimeout(forceExit);
    logger.info('[shutdown] Graceful shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
