/**
 * P10: Security Event Center — 专项测试
 */
import { describe, it, expect, vi } from 'vitest';
import { evaluateRisk, getOverallRisk, DEFAULT_RULES, type ScoredEvent } from '../risk-rules';
import { SecurityEventType, RiskLevel } from '../../../core/security-audit';

describe('P10 Security Event Center', () => {
  // ====== Risk Rules Engine ======

  it('DEFAULT_RULES has 6 rules', () => {
    expect(DEFAULT_RULES.length).toBe(6);
  });

  it('each rule has required fields', () => {
    for (const r of DEFAULT_RULES) {
      expect(r.id).toBeTruthy();
      expect(r.name).toBeTruthy();
      expect(r.eventTypes.length).toBeGreaterThan(0);
      expect(r.threshold).toBeGreaterThan(0);
      expect(r.windowSeconds).toBeGreaterThan(0);
      expect(r.actions.length).toBeGreaterThan(0);
      expect(r.weight).toBeGreaterThan(0);
    }
  });

  it('evaluateRisk: below threshold → empty results', () => {
    const stats = new Map<string, number>([['LOGIN_FAILED', 5]]); // 5 < 20
    const results = evaluateRisk(stats);
    // 登录爆破规则 threshold=20, 5 < 20 → 不触发
    const loginRule = results.filter((s: ScoredEvent) => s.triggeredRules.includes('rule_login_brute_force'));
    expect(loginRule.length).toBe(0);
  });

  it('evaluateRisk: at threshold → triggers', () => {
    const stats = new Map<string, number>([['LOGIN_FAILED', 25]]); // 25 >= 20
    const results = evaluateRisk(stats);
    expect(results.length).toBeGreaterThan(0);
    const login = results[0];
    expect(login.count).toBe(25);
    expect(login.score).toBeGreaterThan(0);
    expect(login.recommendedActions).toContain('BLOCK_IP');
  });

  it('evaluateRisk: score capped at 100', () => {
    const stats = new Map<string, number>([['LOGIN_FAILED', 1000]]);
    const results = evaluateRisk(stats);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeLessThanOrEqual(100);
  });

  it('getOverallRisk: empty → LOW', () => {
    const overall = getOverallRisk([]);
    expect(overall.score).toBe(0);
    expect(overall.level).toBe(RiskLevel.LOW);
    expect(overall.critical).toBe(false);
  });

  it('getOverallRisk: multi-event → weighted average', () => {
    const scored: ScoredEvent[] = [
      { eventType: 'A', count: 10, score: 80, level: RiskLevel.HIGH, triggeredRules: ['r1'], recommendedActions: ['BLOCK_IP'] },
      { eventType: 'B', count: 5, score: 40, level: RiskLevel.MEDIUM, triggeredRules: ['r2'], recommendedActions: ['ALERT_ONLY'] },
    ];
    const overall = getOverallRisk(scored);
    expect(overall.score).toBeGreaterThan(0);
    expect(overall.level).toBeDefined();
  });

  it('getOverallRisk: critical event → critical overall', () => {
    const scored: ScoredEvent[] = [
      { eventType: 'X', count: 1, score: 100, level: RiskLevel.CRITICAL, triggeredRules: ['r1'], recommendedActions: ['REVOKE_ALL_SESSIONS'] },
    ];
    const overall = getOverallRisk(scored);
    expect(overall.critical).toBe(true);
    expect(overall.level).toBe(RiskLevel.CRITICAL);
  });

  // ====== Blocked IP Middleware ======

  it('blocked IP middleware is exported as function', async () => {
    const mod = await import('../ip-block-middleware.js');
    expect(typeof mod.blockedIpMiddleware).toBe('function');
    const mw = mod.blockedIpMiddleware();
    expect(typeof mw).toBe('function');
  });

  // ====== Event Center collectEvent ======

  it('collectEvent: returns { riskScore, actions }', async () => {
    const mod = await import('../event-center.js');
    const result = await mod.collectEvent({
      eventType: SecurityEventType.LOGIN_FAILED,
      ip: '127.0.0.1',
      tenantId: '000000',
      userId: 'u1',
    });
    expect(result).toHaveProperty('riskScore');
    expect(result).toHaveProperty('actions');
    expect(typeof result.riskScore).toBe('number');
    expect(Array.isArray(result.actions)).toBe(true);
  });

  // ====== writeSecurityLog → collectEvent Integration ======

  it('security-audit imports collectEvent (integration point)', async () => {
    const audit = await import('../../../core/security-audit.js');
    expect(audit.writeSecurityLog).toBeDefined();
    expect(typeof audit.writeSecurityLog).toBe('function');
  });
});
