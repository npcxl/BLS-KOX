/**
 * 风险策略 + IP 风险提供者
 *
 * `evaluateCaptchaPolicy()` 决定本轮需要的最小阶段：
 *   - `silent`    ：ALTCHA 静默 PoW 通过即可签发凭证；
 *   - `secondary` ：必须额外完成 Tianai 图形验证（blockPuzzle / clickWord）。
 *
 * 判定全部在服务端完成，客户端无法通过任何参数让自己“跳过”第二层：
 * 命中策略时 `/captcha/verify` 不会签发 captchaToken，只返回 `requiredStage: 'secondary'`。
 * 返回的**内部原因**（ACCOUNT_FAILURES / PRIVILEGED_ACCOUNT …）只写安全审计，不下发前端。
 *
 * 本文件不做任何浏览器指纹识别 —— 只使用 IP 与安全事件中心的聚合风险评分。
 */
import { logger } from '../../core/logger';
import { RiskLevel } from '../../core/security-audit';
import { query } from '../../core/database';
import { getRedisClient } from '../../shared/utils/redis';
import { evaluateRisk, getOverallRisk, DEFAULT_RULES } from '../event-center/risk-rules';
import {
  IP_ACCOUNT_FANOUT_THRESHOLD,
  IP_RISK_SCORE_THRESHOLD,
  RATE_LIMIT_PRESSURE_THRESHOLD,
  type CaptchaFailureReason,
  type CaptchaPolicyDecision,
  type CaptchaPolicyInput,
} from './types';

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
 * 结果在进程内缓存 30s，避免每次校验都打 DB。
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

/**
 * 评估是否需要升级到第二层（TIANAI）。
 *
 * - `forceSecondary=false`（未部署图形验证码服务）→ 永远不升级，但**仍然计算内部原因**供审计；
 * - 命中任一条件 → requireSecondary=true + 内部原因枚举（只许写安全审计，不下发前端）。
 */
export function evaluateCaptchaPolicy(input: CaptchaPolicyInput): CaptchaPolicyDecision {
  const reasons: CaptchaFailureReason[] = [];
  if (input.accountFailures >= input.forceAfterFailures) reasons.push('ACCOUNT_FAILURES');
  if (input.ipAccountCount >= IP_ACCOUNT_FANOUT_THRESHOLD) reasons.push('IP_ACCOUNT_FANOUT');
  if (
    input.ipRiskLevel === RiskLevel.HIGH
    || input.ipRiskLevel === RiskLevel.CRITICAL
    || input.ipRiskScore >= IP_RISK_SCORE_THRESHOLD
  ) {
    reasons.push('IP_RISK_HIGH');
  }
  if (input.rateLimitPressure >= RATE_LIMIT_PRESSURE_THRESHOLD) reasons.push('RATE_LIMIT_PRESSURE');
  if (input.privilegedAccount) reasons.push('PRIVILEGED_ACCOUNT');
  if (input.deviceAnomalous) reasons.push('DEVICE_ANOMALY');

  if (reasons.length === 0) return { requireSecondary: false };
  return { requireSecondary: input.forceSecondary, reason: reasons[0] };
}

/** 判定 User-Agent 是否明显异常（请求头层面的粗粒度检查，不做浏览器指纹识别） */
const BOT_UA_PATTERNS: RegExp[] = [
  /headlesschrome/i, /phantomjs/i, /selenium/i, /puppeteer/i, /playwright/i,
  /python-requests/i, /python-urllib/i, /curl\//i, /wget/i, /httpclient/i,
  /okhttp/i, /go-http-client/i, /node-fetch/i, /axios\//i, /scrapy/i, /\bbot\b/i,
];

export function uaLooksAutomated(userAgent?: string | null): boolean {
  if (!userAgent) return true;
  const ua = userAgent.trim();
  if (ua.length < 10 || ua.length > 1024) return true;
  return BOT_UA_PATTERNS.some((re) => re.test(ua));
}
