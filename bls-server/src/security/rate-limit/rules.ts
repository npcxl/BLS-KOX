import type { RateLimitRule } from './types';

export const defaultRateLimitRules: RateLimitRule[] = [
  // 登录：IP 20次/60s，账号 5次/300s
  { path: '/api/auth/login', methods: ['POST'], dimensions: ['ip'], limit: 20, windowSeconds: 60 },
  { path: '/api/auth/login', methods: ['POST'], dimensions: ['user'], limit: 5, windowSeconds: 300 },

  // 导出：用户 5次/60s，租户 200次/3600s
  { path: '/api/common/excel/export', methods: ['POST'], dimensions: ['user'], limit: 5, windowSeconds: 60 },
  { path: '/api/common/excel/export', methods: ['POST'], dimensions: ['tenant'], limit: 200, windowSeconds: 3600 },

  // 上传：用户 30次/60s
  { path: '/api/system/storage/upload', methods: ['POST'], dimensions: ['user'], limit: 30, windowSeconds: 60 },

  // 默认 API：用户 300次/60s
  { path: '/api/**', methods: ['POST', 'PUT', 'PATCH', 'DELETE'], dimensions: ['user'], limit: 300, windowSeconds: 60 },
  { path: '/api/**', methods: ['GET', 'HEAD', 'OPTIONS'], dimensions: ['user'], limit: 600, windowSeconds: 60 },
];

/** 匹配规则：精确优先 > 通配长前缀优先 */
export function matchRateLimitRule(path: string, method: string, rules: RateLimitRule[]): RateLimitRule | null {
  let best: RateLimitRule | null = null;
  let bestScore = -1;
  const m = method.toUpperCase();
  for (const r of rules) {
    if (r.methods && !r.methods.includes(m)) continue;
    const score = ruleScore(path, r.path);
    if (score > bestScore) { bestScore = score; best = r; }
  }
  return best;
}

function ruleScore(requestPath: string, rulePath: string): number {
  if (rulePath === requestPath) return 1000;
  if (rulePath.endsWith('/**')) {
    const prefix = rulePath.slice(0, -3);
    if (requestPath === prefix || requestPath.startsWith(prefix + '/')) return 500 + prefix.length;
  }
  return -1;
}
