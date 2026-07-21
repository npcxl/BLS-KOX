import { Context, Next } from 'koa';
import { AppError } from '../core/errors';
import { env } from '../config/env';
import { logger } from '../core/logger';

export async function errorHandler(ctx: Context, next: Next): Promise<void> {
  try {
    await next();
    if (ctx.status === 404 && ctx.body === undefined) {
      ctx.status = 404;
      ctx.body = { code: 404, message: '接口不存在' };
    }
  } catch (error: any) {
    if (error instanceof AppError) {
      ctx.status = error.status;
      ctx.body = { code: error.code, message: error.message };
    } else {
      logger.error('未处理的服务端错误', { error: error.message, stack: error.stack });
      ctx.status = 500;
      ctx.body = {
        code: 500,
        message: '服务器内部错误',
        ...(env.nodeEnv === 'development' ? { stack: error.stack } : {}),
      };
    }
    ctx.app.emit('error', error, ctx);
  }
}
