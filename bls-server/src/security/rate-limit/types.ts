/**
 * 限流类型定义
 */
export type RateLimitDimension = 'ip' | 'user' | 'tenant';

export interface RateLimitRule {
  path: string;
  methods?: string[];
  dimensions: RateLimitDimension[];
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix 秒
  retryAfter: number; // 秒
}
