import { Context } from 'koa';

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

export function success<T>(ctx: Context, data?: T, message = '操作成功'): void {
  ctx.body = { code: 200, message, data } satisfies ApiResponse<T>;
}

export function pageSuccess<T>(ctx: Context, rows: T[], total: number, message = '查询成功'): void {
  ctx.body = {
    code: 200,
    message,
    rows,
    total,
  };
}
