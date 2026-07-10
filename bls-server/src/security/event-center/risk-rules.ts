/**
 * P10: Security Risk Rules Engine
 *
 * 风险评分 + 规则引擎 + 自动处置
 */
import { SecurityEventType, RiskLevel } from '../../core/security-audit';

export interface RiskRule {
  id: string;
  name: string;
  /** 事件类型 */
  eventTypes: string[];
  /** 时间窗口（秒） */
  windowSeconds: number;
  /** 触发阈值 */
  threshold: number;
  /** 触发后的风险等级 */
  riskLevel: RiskLevel;
  /** 触发后的处置动作 */
  actions: SecurityAction[];
  /** 规则权重（影响最终评分） */
  weight: number;
}

export type SecurityAction = 'ALERT_ONLY' | 'BLOCK_IP' | 'LOCK_ACCOUNT' | 'REVOKE_SESSION' | 'REVOKE_ALL_SESSIONS' | 'REQUIRE_REAUTH';

export interface ScoredEvent {
  eventType: string;
  count: number;
  score: number;
  level: RiskLevel;
  triggeredRules: string[];
  recommendedActions: SecurityAction[];
}

/** 默认风险规则 */
export const DEFAULT_RULES: RiskRule[] = [
  {
    id: 'rule_login_brute_force',
    name: '登录爆破检测',
    eventTypes: [SecurityEventType.LOGIN_FAILED],
    windowSeconds: 300,
    threshold: 20,
    riskLevel: RiskLevel.HIGH,
    actions: ['BLOCK_IP', 'LOCK_ACCOUNT'],
    weight: 8,
  },
  {
    id: 'rule_refresh_reuse',
    name: 'Refresh Token 复用',
    eventTypes: [SecurityEventType.REFRESH_TOKEN_REUSE],
    windowSeconds: 3600,
    threshold: 1,
    riskLevel: RiskLevel.CRITICAL,
    actions: ['REVOKE_ALL_SESSIONS'],
    weight: 10,
  },
  {
    id: 'rule_cross_tenant',
    name: '跨租户访问检测',
    eventTypes: [SecurityEventType.CROSS_TENANT_ACCESS],
    windowSeconds: 3600,
    threshold: 1,
    riskLevel: RiskLevel.CRITICAL,
    actions: ['ALERT_ONLY'],
    weight: 9,
  },
  {
    id: 'rule_signature_invalid',
    name: '连续签名无效',
    eventTypes: ['SIGNATURE_INVALID'],
    windowSeconds: 60,
    threshold: 5,
    riskLevel: RiskLevel.HIGH,
    actions: ['BLOCK_IP'],
    weight: 7,
  },
  {
    id: 'rule_replay_attack',
    name: '重放攻击检测',
    eventTypes: ['NONCE_REPLAY', 'REPLAY_DETECTED'],
    windowSeconds: 60,
    threshold: 10,
    riskLevel: RiskLevel.HIGH,
    actions: ['BLOCK_IP'],
    weight: 8,
  },
  {
    id: 'rule_rate_limit',
    name: '高频限流触发',
    eventTypes: ['RATE_LIMIT_EXCEEDED'],
    windowSeconds: 60,
    threshold: 50,
    riskLevel: RiskLevel.MEDIUM,
    actions: ['ALERT_ONLY'],
    weight: 4,
  },
];

/**
 * 根据事件统计评估风险
 */
export function evaluateRisk(
  eventStats: Map<string, number>,
  rules: RiskRule[] = DEFAULT_RULES,
): ScoredEvent[] {
  const results: ScoredEvent[] = [];

  for (const rule of rules) {
    let totalCount = 0;
    for (const eventType of rule.eventTypes) {
      totalCount += eventStats.get(eventType) ?? 0;
    }

    if (totalCount >= rule.threshold) {
      const score = Math.min(100, (totalCount / rule.threshold) * rule.weight * 10);
      results.push({
        eventType: rule.eventTypes.join(','),
        count: totalCount,
        score,
        level: rule.riskLevel,
        triggeredRules: [rule.id],
        recommendedActions: rule.actions,
      });
    }
  }

  // 按分数降序排列
  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * 合并多个 ScoredEvent 计算综合风险评分
 */
export function getOverallRisk(scored: ScoredEvent[]): { score: number; level: RiskLevel; critical: boolean } {
  if (scored.length === 0) return { score: 0, level: RiskLevel.LOW, critical: false };

  const total = scored.reduce((sum, s) => sum + s.score, 0) / scored.length;
  const hasCritical = scored.some((s) => s.level === RiskLevel.CRITICAL);

  let level: RiskLevel;
  if (hasCritical || total >= 90) level = RiskLevel.CRITICAL;
  else if (total >= 70) level = RiskLevel.HIGH;
  else if (total >= 40) level = RiskLevel.MEDIUM;
  else level = RiskLevel.LOW;

  return { score: total, level, critical: hasCritical };
}
