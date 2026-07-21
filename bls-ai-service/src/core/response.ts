import { Context } from 'koa';

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

export function success<T>(ctx: Context, data?: T, message = '操作成功'): void {
  ctx.status = 200;
  ctx.body = { code: 0, message, data } satisfies ApiResponse<T>;
}

export function fail(ctx: Context, code: number, message: string): void {
  ctx.status = code >= 500 ? 500 : code;
  ctx.body = { code, message } satisfies ApiResponse;
}
