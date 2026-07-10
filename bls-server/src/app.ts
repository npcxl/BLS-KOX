import Koa from 'koa';
import cors from '@koa/cors';
import helmet from 'koa-helmet';
import bodyParser from 'koa-bodyparser';
import koaBody from 'koa-body';
import { env } from './config/env';
import http from 'node:http';
import { createRouter } from './core/router';
import { errorHandler } from './middleware/error-handler';
import { tenantMiddleware } from './middleware/tenant';
import { replayProtectionMiddleware } from './middlewares/replayProtection';
import { requestContextMiddleware } from './core/request-context';
import { rateLimitMiddleware } from './security/rate-limit/middleware';
import { logger } from './core/logger';
import { attachRealtimeWs } from './api/system/realtime/realtime.ws';

export function createApp(): Koa {
  const app = new Koa();

  // 可信代理：仅在 Nginx 前置时开启，Koa 信任 X-Forwarded-* Header
  if (env.trustProxy) app.proxy = true;

  const router = createRouter();

  app.use(errorHandler);
  app.use(helmet());
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
  app.use(tenantMiddleware);
  app.use(replayProtectionMiddleware());
  app.use(rateLimitMiddleware());
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
  attachRealtimeWs(server, app);
  server.listen(env.port, env.host, () => {
    logger.info(`${env.appName} started`, { host: env.host, port: env.port, nodeEnv: env.nodeEnv });
  });

  // ========== Graceful Shutdown ==========
  let shuttingDown = false;
  const SHUTDOWN_TIMEOUT = 30_000;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // 1. Stop accepting new connections
    server.close((err) => {
      if (err) logger.error('Server close error', { error: String(err) });
    });

    // 2. Close WebSocket connections

    // 3. Close Redis
    try {
      const { closeRedis } = require('./shared/utils/redis');
      await closeRedis();
    } catch {}

    // 4. MySQL pool closes automatically on process exit

    // Force exit after timeout
    setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT).unref();

    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
