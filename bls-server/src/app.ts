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

  // P11: API Versioning
  // Deprecation header for non-versioned paths
  app.use(async (ctx, next) => {
    if (ctx.path.startsWith('/api/') && !ctx.path.startsWith('/api/v1/')) {
      ctx.set('Deprecation', 'true');
      ctx.set('Sunset', new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString());
    }
    await next();
  });
  app.use(apiVersion());
  app.use(router.routes());
  app.use(router.allowedMethods());
  app.on('error', (error) => {
    logger.error('Unhandled application error', { error: String(error) });
  });

  return app;
}

if (require.main === module) {
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
