import type { RateLimitRule } from './types';

export const defaultRateLimitRules: RateLimitRule[] = [
  // 登录：IP + account 双维度
  { path: '/api/auth/login', methods: ['POST'], dimensions: ['ip'], limit: 20, windowSeconds: 60 },
  { path: '/api/auth/login', methods: ['POST'], dimensions: ['account'], limit: 5, windowSeconds: 300 },

  // 登录人机验证（两级统一入口）：IP / account / device 多维度，
  // 防止无限创建 challenge（ALTCHA 与第二层会话）消耗 Redis 与上游 CPU。
  // 统一入口后只有 /api/captcha/{config,generate,verify}。
  { path: '/api/captcha/config', methods: ['GET'], dimensions: ['ip'], limit: 120, windowSeconds: 60 },
  // 生成：第一层（ALTCHA 本地）+ 第二层（Tianai 上游，需先消费 escalation grant）
  { path: '/api/captcha/generate', methods: ['POST'], dimensions: ['ip'], limit: 60, windowSeconds: 60 },
  { path: '/api/captcha/generate', methods: ['POST'], dimensions: ['account'], limit: 30, windowSeconds: 300 },
  { path: '/api/captcha/generate', methods: ['POST'], dimensions: ['device'], limit: 30, windowSeconds: 300 },
  // 校验：第一层 PoW / 第二层轨迹
  { path: '/api/captcha/verify', methods: ['POST'], dimensions: ['ip'], limit: 30, windowSeconds: 60 },
  { path: '/api/captcha/verify', methods: ['POST'], dimensions: ['account'], limit: 20, windowSeconds: 300 },
  { path: '/api/captcha/verify', methods: ['POST'], dimensions: ['device'], limit: 30, windowSeconds: 300 },

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
