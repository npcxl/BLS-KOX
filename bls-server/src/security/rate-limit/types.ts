export type RateLimitDimension = 'ip' | 'user' | 'tenant' | 'account' | 'device';

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
  resetAt: number;
  retryAfter: number;
}
