import { Context, Next } from "koa";
import { AppError } from "../core/errors";
import { env } from "../config/env";

export async function errorHandler(ctx: Context, next: Next): Promise<void> {
  try {
    await next();
    if (ctx.status === 404 && ctx.body === undefined) {
      ctx.status = 404;
      ctx.body = { code: 404, message: "接口不存在" };
    }
  } catch (error) {
    const appError =
      error instanceof AppError ? error : new AppError("服务器内部错误");
    ctx.status = appError.status;
    ctx.body = {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
      ...(env.nodeEnv === "development" && !(error instanceof AppError)
        ? { stack: (error as Error).stack }
        : {}),
    };
    ctx.app.emit("error", error, ctx);
  }
}
