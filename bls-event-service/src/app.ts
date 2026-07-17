import Koa from 'koa';
import http from 'http';
import helmet from 'koa-helmet';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import Router from 'koa-router';
import { env } from './config/env';
import { internalAuth } from './middleware/internal-auth';
import { metricsRegistry } from './observability/metrics';
import { closeDatabase } from './core/database';
import eventRoutes from './routes/event.routes';

export function createApp(): Koa {
  const app = new Koa();

  if (env.isProduction) app.proxy = true;

  app.use(helmet());
  app.use(cors({ origin: '*' }));
  app.use(bodyParser({ enableTypes: ['json'] }));

  // ====== /internal — 内部服务鉴权 ======
  const internalR = new Router({ prefix: '/internal' });
  internalR.use(internalAuth());

  // /internal/events (POST/GET)
  internalR.use(eventRoutes.routes());
  internalR.use(eventRoutes.allowedMethods());

  // /internal/health — 健康检查
  internalR.get('/health', (ctx: Koa.Context) => {
    ctx.body = { status: 'UP', service: 'bls-event-service', timestamp: new Date().toISOString() };
  });

  // /internal/metrics — Prometheus 指标
  internalR.get('/metrics', async (ctx: Koa.Context) => {
    ctx.set('Content-Type', metricsRegistry.contentType);
    ctx.body = await metricsRegistry.metrics();
  });

  app.use(internalR.routes());
  app.use(internalR.allowedMethods());

  // ====== 公开健康检查端点 ======
  const publicR = new Router();
  publicR.get('/health', (ctx: Koa.Context) => {
    ctx.body = { status: 'UP', service: 'bls-event-service', timestamp: new Date().toISOString() };
  });
  publicR.get('/metrics', async (ctx: Koa.Context) => {
    ctx.set('Content-Type', metricsRegistry.contentType);
    ctx.body = await metricsRegistry.metrics();
  });
  app.use(publicR.routes());
  app.use(publicR.allowedMethods());

  app.on('error', (error) => {
    console.error('[event-service] Unhandled application error', { error: String(error) });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const server = http.createServer(app.callback());

  server.listen(env.port, env.host, () => {
    console.log(`[event-service] ${env.appName} started on ${env.host}:${env.port}`, {
      nodeEnv: env.nodeEnv,
    });
  });

  let shuttingDown = false;
  const SHUTDOWN_TIMEOUT = 15_000;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[event-service] Received ${signal}, shutting down gracefully...`);

    const forceExit = setTimeout(() => {
      console.error('[event-service] Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT).unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    } catch (e) {
      console.error('[event-service] HTTP server close error', { error: String(e) });
    }

    try { await closeDatabase(); } catch { /* ignore */ }
    clearTimeout(forceExit);
    console.log('[event-service] Graceful shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
