import { describe, it, expect } from 'vitest';
import { defaultRateLimitRules, matchRateLimitRules } from '../security/rate-limit/rules';

describe('Rate Limit Rules', () => {
  it('精确路由优先于 wildcard', () => {
    const rules = matchRateLimitRules('/api/auth/login', 'POST', defaultRateLimitRules);
    expect(rules.length).toBe(2); // IP + account
    expect(rules.every((r) => r.path === '/api/auth/login')).toBe(true);
  });

  it('同路径多条规则全部返回', () => {
    const rules = matchRateLimitRules('/api/common/excel/export', 'POST', defaultRateLimitRules);
    expect(rules.length).toBe(2); // user + tenant
  });

  it('/api/** 作为 fallback', () => {
    const rules = matchRateLimitRules('/api/random/path', 'POST', defaultRateLimitRules);
    expect(rules.length).toBe(1);
    expect(rules[0].path).toBe('/api/**');
  });

  it('methods 不匹配时不执行', () => {
    const rules = matchRateLimitRules('/api/random/path', 'PATCH', defaultRateLimitRules);
    expect(rules.every((r) => r.methods!.includes('PATCH'))).toBe(true);
  });

  it('GET 使用独立限制', () => {
    const rules = matchRateLimitRules('/api/random/path', 'GET', defaultRateLimitRules);
    expect(rules[0].limit).toBe(600);
  });
});
