import type { RateLimitRule } from './types';

export const defaultRateLimitRules: RateLimitRule[] = [
  // 登录：IP + account 双维度
  { path: '/api/auth/login', methods: ['POST'], dimensions: ['ip'], limit: 20, windowSeconds: 60 },
  { path: '/api/auth/login', methods: ['POST'], dimensions: ['account'], limit: 5, windowSeconds: 300 },

  // 导出：user + tenant
  { path: '/api/common/excel/export', methods: ['POST'], dimensions: ['user'], limit: 5, windowSeconds: 60 },
  { path: '/api/common/excel/export', methods: ['POST'], dimensions: ['tenant'], limit: 200, windowSeconds: 3600 },

  // 上传
  { path: '/api/system/storage/upload', methods: ['POST'], dimensions: ['user'], limit: 30, windowSeconds: 60 },

  // 默认
  { path: '/api/**', methods: ['POST', 'PUT', 'PATCH', 'DELETE'], dimensions: ['user'], limit: 300, windowSeconds: 60 },
  { path: '/api/**', methods: ['GET', 'HEAD', 'OPTIONS'], dimensions: ['user'], limit: 600, windowSeconds: 60 },
];

/** 返回匹配的所有规则（精确优先于通配） */
export function matchRateLimitRules(path: string, method: string, rules: RateLimitRule[]): RateLimitRule[] {
  const m = method.toUpperCase();
  const result: RateLimitRule[] = [];
  let bestExact = -1;

  for (const r of rules) {
    if (r.methods && !r.methods.includes(m)) continue;
    const score = ruleScore(path, r.path);
    if (score < 0) continue;

    if (score >= 1000) {
      // 精确匹配：收集同路径的所有规则
      if (bestExact < 0) { bestExact = score; result.length = 0; result.push(r); }
      else if (score === bestExact) { result.push(r); }
    } else if (bestExact < 0) {
      // 尚无精确规则，收集通配规则（长前缀优先）
      if (result.length === 0 || score > ruleScore(path, result[0].path)) { result.length = 0; result.push(r); }
      else if (score === ruleScore(path, result[0].path)) { result.push(r); }
    }
  }
  return result;
}

function ruleScore(requestPath: string, rulePath: string): number {
  if (rulePath === requestPath) return 1000;
  if (rulePath.endsWith('/**')) {
    const prefix = rulePath.slice(0, -3);
    if (requestPath === prefix || requestPath.startsWith(prefix + '/')) return 500 + prefix.length;
  }
  return -1;
}
