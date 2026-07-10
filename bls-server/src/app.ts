import os from 'os';
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
import { attachRealtimeWs } from './api/system/realtime/realtime.ws';

function getLanUrls(port: number): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((net): net is os.NetworkInterfaceInfo => Boolean(net) && net?.family === 'IPv4' && !net?.internal)
    .map((net) => `http://${net.address}:${port}`);
}

export function createApp(): Koa {
  const app = new Koa();
  const router = createRouter();

  app.use(errorHandler);
  app.use(helmet());
  app.use(cors({
    credentials: true,
    origin: (ctx) => {
      const origin = ctx.get('Origin');
      if (!origin) return '';
      // 生产环境白名单检查
      if (env.isProduction && env.corsOrigins.length > 0) {
        if (env.corsOrigins.some((o: string) => o === origin || o === '*')) return origin;
        return '';
      }
      // 开发环境或未配置白名单时用 corsOrigin
      return env.corsOrigin === '*' ? origin : env.corsOrigin;
    },
  }));
  app.use(koaBody({ multipart: true, formidable: { multiples: false } }));
  app.use(bodyParser({ enableTypes: ['json', 'form'] }));
  app.use(requestContextMiddleware);
  app.use(tenantMiddleware);
  app.use(replayProtectionMiddleware());
  app.use(router.routes());
  app.use(router.allowedMethods());
  app.on('error', (error) => {
    if (env.nodeEnv === 'development') {
      console.error(error);
    }
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const server = http.createServer(app.callback());
  attachRealtimeWs(server, app);
  server.listen(env.port, env.host, () => {
    console.log(`${env.appName} listening on http://localhost:${env.port}`);
    const lanUrls = getLanUrls(env.port);
    if (lanUrls.length > 0) {
      console.log(`LAN access: ${lanUrls.join(', ')}`);
    }
    if (env.redis.enabled) {
      console.log(`[redis] connected ${env.redis.host}:${env.redis.port}`);
    }
  });
}
