/**
 * 强制二级验证策略
 *
 * 即使处于 adaptive 模式且静默验证通过，命中以下任一条件也必须进入第二层：
 *   - 同一账号近期连续登录失败达到 forceAfterFailures
 *   - 同一 IP 短时间尝试多个账号
 *   - IP 已达到中高风险（Security Event Center 规则引擎评分）
 *   - nonce 重放
 *   - User-Agent / 设备特征明显异常
 *   - Security Event Center 判定为 HIGH / CRITICAL
 *   - 登录平台超级管理员账号
 *   - Rate Limit 压力过高
 *
 * 全部条件在**服务端**评估，客户端无法通过任何参数跳过第二层。
 */
import { logger } from '../../core/logger';
import { RiskLevel } from '../../core/security-audit';
import { query } from '../../core/database';
import { getRedisClient } from '../../shared/utils/redis';
import { evaluateRisk, getOverallRisk, DEFAULT_RULES } from '../event-center/risk-rules';
import type { SilentReason } from './types';
import type { CaptchaRuntimeConfig } from './config';

export interface IpRisk {
  score: number;
  level: RiskLevel;
}

export interface RiskProvider {
  getIpRisk(ip: string): Promise<IpRisk>;
}

const RISK_WINDOW_SECONDS = 300;
const RISK_CACHE_TTL_MS = 30_000;
const RISK_CACHE_MAX = 5000;

const LOW_RISK: IpRisk = { score: 0, level: RiskLevel.LOW };

/**
 * 默认风险提供者：
 *   1. 命中 IP 黑名单（Redis security:blocked_ip:*，由 Event Center 自动处置写入）→ HIGH；
 *   2. 否则复用 Security Event Center 的风险规则引擎，对近 5 分钟该 IP 的安全事件聚合评分。
 * 结果在进程内缓存 30s，避免每次静默验证都打 DB。
 */
export function createDefaultRiskProvider(): RiskProvider {
  const cache = new Map<string, { at: number; value: IpRisk }>();

  return {
    async getIpRisk(ip: string): Promise<IpRisk> {
      if (!ip || ip === 'unknown') return LOW_RISK;

      const cached = cache.get(ip);
      if (cached && Date.now() - cached.at < RISK_CACHE_TTL_MS) return cached.value;

      const put = (value: IpRisk): IpRisk => {
        if (cache.size >= RISK_CACHE_MAX) cache.clear();
        cache.set(ip, { at: Date.now(), value });
        return value;
      };

      // 1. IP 黑名单
      try {
        const redis = getRedisClient();
        if (redis) {
          const blocked = await redis.exists(`security:blocked_ip:${ip}`);
          if (blocked > 0) return put({ score: 80, level: RiskLevel.HIGH });
        }
      } catch { /* 忽略：风险信号缺失不影响可用性 */ }

      // 2. Event Center 规则引擎
      try {
        const rows = await query<any>(
          `SELECT event_type, COUNT(*) as cnt
           FROM sys_security_log
           WHERE client_ip = :ip AND create_time >= NOW() - INTERVAL :window SECOND
           GROUP BY event_type`,
          { ip, window: String(RISK_WINDOW_SECONDS) },
        );
        const stats = new Map<string, number>();
        for (const r of rows) stats.set(String(r.event_type ?? ''), Number(r.cnt ?? 0));
        const overall = getOverallRisk(evaluateRisk(stats, DEFAULT_RULES));
        return put({ score: Math.round(overall.score), level: overall.level });
      } catch (err) {
        logger.warn('[captcha] ip risk lookup failed', { error: String(err) });
        return put(LOW_RISK);
      }
    },
  };
}

export interface ForceEvaluationInput {
  mode: CaptchaRuntimeConfig['mode'];
  forceAfterFailures: number;
  accountFailures: number;
  ipAccountCount: number;
  ipRisk: IpRisk;
  rateLimitPressure: number;
  nonceReplayed: boolean;
  uaAnomalous: boolean;
  privilegedAccount: boolean;
}

export interface ForceEvaluation {
  forced: boolean;
  reasons: SilentReason[];
}

/** 同一 IP 在窗口期内尝试过的不同账号数达到该值 → 强制二级 */
export const IP_ACCOUNT_FANOUT_THRESHOLD = 3;
/** Rate Limit 压力阈值（同一 IP 在登录限流窗口内的计数） */
export const RATE_LIMIT_PRESSURE_THRESHOLD = 10;

/** 评估是否强制进入第二层（mode=always 时由调用方直接判定） */
export function evaluateForceSecondary(input: ForceEvaluationInput): ForceEvaluation {
  if (input.mode === 'always') {
    return { forced: true, reasons: ['RISK_FORCED'] };
  }

  const reasons: SilentReason[] = [];

  if (input.accountFailures >= input.forceAfterFailures) reasons.push('ACCOUNT_FAILURES');
  if (input.ipAccountCount >= IP_ACCOUNT_FANOUT_THRESHOLD) reasons.push('IP_ACCOUNT_FANOUT');
  if (input.ipRisk.level === RiskLevel.HIGH || input.ipRisk.level === RiskLevel.CRITICAL || input.ipRisk.score >= 70) {
    reasons.push('IP_RISK_HIGH');
  }
  if (input.nonceReplayed) reasons.push('NONCE_REPLAY');
  if (input.uaAnomalous) reasons.push('DEVICE_ANOMALY');
  if (input.privilegedAccount) reasons.push('PRIVILEGED_ACCOUNT');
  if (input.rateLimitPressure >= RATE_LIMIT_PRESSURE_THRESHOLD) reasons.push('RATE_LIMIT_PRESSURE');

  return { forced: reasons.length > 0, reasons };
}
