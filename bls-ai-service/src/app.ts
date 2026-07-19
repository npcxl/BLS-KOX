import Koa from 'koa';
import http from 'http';
import helmet from 'koa-helmet';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import Router from 'koa-router';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { jwtAuth } from './middleware/auth';
import { requestContextMiddleware } from './core/request-context';
import { auditLogMiddleware } from './middleware/audit-log';
import { aiRateLimit } from './middleware/rate-limit';
import { connectRedis, closeRedis } from './shared/redis';
import { logger } from './core/logger';
import { attachAiWs } from './ws/stream-handler';

import crudGenerator from './api/crud/generator';
import sqlGenerator from './api/sql/generator';
import auditAnalyzer from './api/audit/analyzer';
import configReviewer from './api/config/reviewer';

export function createApp(): Koa {
  const app = new Koa();

  if (env.isProduction) app.proxy = true;

  // ====== 全局中间件 ======
  app.use(errorHandler);
  app.use(helmet());
  app.use(cors({ origin: '*' }));
  app.use(bodyParser({ enableTypes: ['json'] }));

  // 请求上下文（requestId / traceId）
  app.use(requestContextMiddleware);

  // ====== /api/ai — AI 微服务路由 ======
  const aiRouter = new Router({ prefix: '/api/ai' });

  // 所有 AI 接口都需要 JWT 认证
  aiRouter.use(jwtAuth());

  // 审计日志（记录所有 AI 请求）
  aiRouter.use(auditLogMiddleware);

  // ====== CRUD Generator ======
  // POST /api/ai/crud/generate
  const crudR = new Router({ prefix: '/crud' });
  crudR.use(aiRateLimit(env.rateLimit.aiPerMinute));
  crudR.use(crudGenerator.routes());
  crudR.use(crudGenerator.allowedMethods());
  aiRouter.use(crudR.routes());
  aiRouter.use(crudR.allowedMethods());

  // ====== SQL Assistant ======
  // POST /api/ai/sql/generate
  const sqlR = new Router({ prefix: '/sql' });
  sqlR.use(aiRateLimit(env.rateLimit.sqlPerMinute));
  sqlR.use(sqlGenerator.routes());
  sqlR.use(sqlGenerator.allowedMethods());
  aiRouter.use(sqlR.routes());
  aiRouter.use(sqlR.allowedMethods());

  // ====== Audit Analyzer ======
  // POST /api/ai/audit/analyze
  const auditR = new Router({ prefix: '/audit' });
  auditR.use(aiRateLimit(env.rateLimit.aiPerMinute));
  auditR.use(auditAnalyzer.routes());
  auditR.use(auditAnalyzer.allowedMethods());
  aiRouter.use(auditR.routes());
  aiRouter.use(auditR.allowedMethods());

  // ====== Config Reviewer ======
  // POST /api/ai/config/review
  const configR = new Router({ prefix: '/config' });
  configR.use(aiRateLimit(env.rateLimit.aiPerMinute));
  configR.use(configReviewer.routes());
  configR.use(configReviewer.allowedMethods());
  aiRouter.use(configR.routes());
  aiRouter.use(configR.allowedMethods());

  app.use(aiRouter.routes());
  app.use(aiRouter.allowedMethods());

  // ====== 健康检查 ======
  const publicR = new Router();
  publicR.get('/health', (ctx: Koa.Context) => {
    ctx.body = {
      status: 'UP',
      service: 'bls-ai-service',
      timestamp: new Date().toISOString(),
      aiProvider: env.ai.provider,
      aiModel: env.ai.model,
    };
  });
  app.use(publicR.routes());
  app.use(publicR.allowedMethods());

  app.on('error', (error) => {
    logger.error('未处理的全局错误', { error: String(error) });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const server = http.createServer(app.callback());

  // 挂载 AI 流式 WebSocket
  attachAiWs(server);

  // 连接 Redis
  connectRedis().catch((err) => {
    logger.warn('Redis 连接失败，限流功能将降级', { error: String(err) });
  });

  server.listen(env.port, env.host, () => {
    logger.info(`${env.appName} started`, {
      host: env.host,
      port: env.port,
      nodeEnv: env.nodeEnv,
      aiProvider: env.ai.provider,
      aiModel: env.ai.model,
    });
  });

  // ========== Graceful Shutdown ==========
  let shuttingDown = false;
  const SHUTDOWN_TIMEOUT = 15_000;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timeout, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT).unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    } catch (e: any) {
      logger.error('HTTP server close error', { error: String(e) });
    }

    try { await closeRedis(); } catch { /* ignore */ }
    try {
      const { getWsServer } = require('./ws/stream-handler');
      const wss = getWsServer();
      if (wss) {
        await new Promise<void>((resolve) => wss.close(() => resolve()));
      }
    } catch { /* ignore */ }
    clearTimeout(forceExit);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
