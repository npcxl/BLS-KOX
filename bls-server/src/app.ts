import os from 'os';
import Koa from 'koa';
import cors from '@koa/cors';
import helmet from 'koa-helmet';
import bodyParser from 'koa-bodyparser';
import { env } from './config/env';
import { createRouter } from './core/router';
import { errorHandler } from './middleware/error-handler';
import { tenantMiddleware } from './middleware/tenant';

function getLanUrls(port: number): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((net) => net?.family === 'IPv4' && !net.internal)
    .map((net) => `http://${net.address}:${port}`);
}

export function createApp(): Koa {
  const app = new Koa();
  const router = createRouter();

  app.use(errorHandler);
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(bodyParser({ enableTypes: ['json', 'form'] }));
  app.use(tenantMiddleware);
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
  createApp().listen(env.port, env.host, () => {
    console.log(`${env.appName} listening on http://localhost:${env.port}`);

    const lanUrls = getLanUrls(env.port);
    if (lanUrls.length > 0) {
      console.log(`LAN access: ${lanUrls.join(', ')}`);
    }
  });
}
