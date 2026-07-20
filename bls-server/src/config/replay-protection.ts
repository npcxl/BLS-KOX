/**
 * 防重放攻击规则配置
 *
 * 规则匹配优先级：
 * 1. 精确路径匹配（path 不含 **）
 * 2. 通配路径匹配（path 含 /**）—— 长前缀优先
 * 3. 默认规则兜底
 *
 * methods 为空或未设置 → 匹配所有 HTTP 方法
 */

export type ReplayMode = 'off' | 'timestamp' | 'nonce' | 'signature';

export interface ReplayRule {
  /** 路径模式，支持 /api/** 通配 */
  path: string;
  /** 匹配的 HTTP 方法，未设置则匹配所有 */
  methods?: string[];
  /** 防护等级 */
  mode: ReplayMode;
  /** 时间窗口（秒），timestamp/nonce/signature 模式生效 */
  windowSeconds?: number;
  /** Nonce Redis TTL（秒），nonce/signature 模式生效 */
  nonceTtlSeconds?: number;
  /** 是否启用幂等 */
  idempotent?: boolean;
  /** 幂等 Key Redis TTL（秒），默认 3600 */
  idempotentTtlSeconds?: number;
}

export const defaultReplayRules: ReplayRule[] = [
  // ===== 高危接口 =====
  {
    path: '/api/system/user/reset-password',
    methods: ['POST'],
    mode: 'signature',
    windowSeconds: 60,
    nonceTtlSeconds: 180,
  },
  // 角色管理 CRUD 防重放（nonce 模式，浏览器兼容）
  {
    path: '/api/system/role/add',
    methods: ['POST'],
    mode: 'nonce',
    windowSeconds: 60,
    nonceTtlSeconds: 180,
  },
  {
    path: '/api/system/role/edit',
    methods: ['PUT'],
    mode: 'nonce',
    windowSeconds: 60,
    nonceTtlSeconds: 180,
  },
  {
    path: '/api/system/role/remove',
    methods: ['DELETE'],
    mode: 'nonce',
    windowSeconds: 60,
    nonceTtlSeconds: 180,
  },
  // 存储配置 CRUD 防重放
  {
    path: '/api/system/storage/add',
    methods: ['POST'],
    mode: 'nonce',
    windowSeconds: 60,
    nonceTtlSeconds: 180,
  },
  {
    path: '/api/system/storage/edit',
    methods: ['PUT'],
    mode: 'nonce',
    windowSeconds: 60,
    nonceTtlSeconds: 180,
  },
  {
    path: '/api/system/storage/remove',
    methods: ['DELETE'],
    mode: 'nonce',
    windowSeconds: 60,
    nonceTtlSeconds: 180,
  },

  // ===== 财务/支付接口 =====
  {
    path: '/api/payment/**',
    methods: ['POST', 'PUT', 'PATCH'],
    mode: 'signature',
    windowSeconds: 30,
    nonceTtlSeconds: 600,
    idempotent: true,
    idempotentTtlSeconds: 7200,
  },
  {
    path: '/api/finance/**',
    methods: ['POST', 'PUT', 'PATCH'],
    mode: 'signature',
    windowSeconds: 30,
    nonceTtlSeconds: 600,
    idempotent: true,
    idempotentTtlSeconds: 7200,
  },

  // ===== 登录接口 =====
  {
    path: '/api/auth/login',
    methods: ['POST'],
    mode: 'nonce',
    windowSeconds: 60,
    nonceTtlSeconds: 150,  // >= window*2+30
  },

  // ===== 默认：写操作防重放 =====
  {
    path: '/api/**',
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    mode: 'nonce',
    windowSeconds: 120,
    nonceTtlSeconds: 300,  // >= window*2+30
  },

  // ===== AI 对话管理：豁免 =====
  {
    path: '/api/ai/chat/conversations',
    methods: ['GET', 'POST', 'DELETE'],
    mode: 'off',
  },

  // ===== 默认：读操作不拦截 =====
  {
    path: '/api/**',
    methods: ['GET', 'HEAD', 'OPTIONS'],
    mode: 'off',
  },
];

/** 匹配规则：精确优先 > 通配长前缀优先 > 默认 */
export function matchRule(
  path: string,
  method: string,
  rules: ReplayRule[],
): ReplayRule | null {
  const methodUpper = method.toUpperCase();
  let bestMatch: ReplayRule | null = null;
  let bestScore = -1;

  for (const rule of rules) {
    // 方法不匹配跳过
    if (rule.methods && rule.methods.length > 0 && !rule.methods.includes(methodUpper)) continue;

    const score = matchScore(path, rule.path);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = rule;
    }
  }

  return bestMatch;
}

function matchScore(requestPath: string, rulePath: string): number {
  // 精确匹配最高分
  if (rulePath === requestPath) return 1000;

  // 通配匹配：rulePath 以 /** 结尾
  if (rulePath.endsWith('/**')) {
    const prefix = rulePath.slice(0, -3);
    if (requestPath === prefix || requestPath.startsWith(prefix + '/')) {
      // 前缀越长越优先
      return 500 + prefix.length;
    }
  }

  return -1;
}
