/**
 * P11: API Versioning Middleware
 *
 * 路由前缀分类:
 *   /api/v1/*    — 前端业务接口 (默认)
 *   /openapi/v1/* — 第三方开放接口 (独立鉴权)
 *   /internal/*  — 内部服务接口 (仅内网)
 */
import type { Context, Next } from 'koa';

/** API 前缀类型 */
export const API_PREFIXES = {
  V1: '/api/v1',
  OPENAPI_V1: '/openapi/v1',
  INTERNAL: '/internal',
} as const;

/**
 * 注入 API 版本信息到 ctx.state
 */
export function apiVersion() {
  return async (ctx: Context, next: Next) => {
    const path = ctx.path;

    if (path.startsWith(API_PREFIXES.V1)) {
      ctx.state.apiVersion = 'v1';
    } else if (path.startsWith(API_PREFIXES.OPENAPI_V1)) {
      ctx.state.apiVersion = 'openapi_v1';
    } else if (path.startsWith(API_PREFIXES.INTERNAL)) {
      ctx.state.apiVersion = 'internal';
    } else {
      ctx.state.apiVersion = 'v1'; // 默认
    }

    await next();
  };
}
