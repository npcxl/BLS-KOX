/**
 * P10: Security Event Center
 *
 * 统一安全事件采集 → 聚合 → 评分 → 告警 → 处置
 */
import { execute, query } from '../../core/database';
import { logger } from '../../core/logger';
import { evaluateRisk, getOverallRisk, DEFAULT_RULES, type SecurityAction, type RiskRule } from './risk-rules';
import { writeSecurityLog, SecurityEventType } from '../../core/security-audit';

const WINDOW_SECONDS = 300; // 5 分钟聚合窗口

interface EventAggregate {
  ip: string;
  tenantId: string;
  userId?: string;
  events: Map<string, number>;
}

/**
 * 采集安全事件（被动聚合 + 风险评估）
 */
export async function collectEvent(params: {
  eventType: string;
  ip: string;
  tenantId: string;
  userId?: string;
}): Promise<{ riskScore: number; actions: SecurityAction[] }> {
  try {
    // 查询时间窗口内同 IP 的事件统计
    const rows = await execute(
      `SELECT event_type, COUNT(*) as cnt
       FROM sys_security_log
       WHERE client_ip = :ip AND create_time >= NOW() - INTERVAL :window SECOND
       GROUP BY event_type`,
      { ip: params.ip, window: String(WINDOW_SECONDS) },
    );

    const stats = new Map<string, number>();
    if (Array.isArray(rows)) {
      for (const r of rows as any[]) {
        stats.set(String(r.event_type ?? ''), Number(r.cnt ?? 0));
      }
    }

    // 当前事件计数+1
    stats.set(params.eventType, (stats.get(params.eventType) ?? 0) + 1);

    // 评估风险
    const scored = evaluateRisk(stats, DEFAULT_RULES);
    const overall = getOverallRisk(scored);

    if (overall.critical || overall.score >= 70) {
      // 收集需要执行的动作
      const actions = new Set<SecurityAction>();
      for (const s of scored) {
        for (const a of s.recommendedActions) actions.add(a);
      }

      logger.warn('[event-center] risk detected', {
        ip: params.ip,
        score: overall.score,
        level: overall.level,
        actions: [...actions],
        triggeredRules: scored.map((s) => s.triggeredRules.join(',')),
      });

      // 执行自动处置
      await executeActions([...actions], params);

      return { riskScore: overall.score, actions: [...actions] };
    }

    return { riskScore: overall.score, actions: [] };
  } catch (err) {
    logger.error('[event-center] collectEvent error', { error: String(err) });
    return { riskScore: 0, actions: [] };
  }
}

/**
 * 执行安全处置动作
 */
async function executeActions(actions: SecurityAction[], params: { ip: string; tenantId: string; userId?: string }): Promise<void> {
  for (const action of actions) {
    switch (action) {
      case 'ALERT_ONLY':
        logger.warn('[event-center] ALERT', { ip: params.ip, tenantId: params.tenantId });
        break;

      case 'BLOCK_IP':
        try {
          const { getRedisClient } = require('../../shared/utils/redis');
          const redis = getRedisClient();
          if (redis) {
            await redis.set(`security:blocked_ip:${params.ip}`, '1', 'EX', 3600);
            logger.warn('[event-center] BLOCK_IP', { ip: params.ip });

            // 处置审计
            await writeSecurityLog({
              eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
              title: `自动封禁 IP：${params.ip}`,
              detail: { action: 'BLOCK_IP', ip: params.ip, duration: '3600s' },
              source: 'event-center',
            }).catch(() => {});
          }
        } catch {}
        break;

      case 'LOCK_ACCOUNT':
        if (params.userId) {
          try {
            await execute('UPDATE sys_user SET status = 1 WHERE user_id = :uid AND tenant_id = :tid',
              { uid: params.userId, tid: params.tenantId });
            logger.warn('[event-center] LOCK_ACCOUNT', { userId: params.userId });

            await writeSecurityLog({
              eventType: SecurityEventType.SECURITY_VALIDATION_FAILED,
              title: `自动锁定账户：${params.userId}`,
              detail: { action: 'LOCK_ACCOUNT', userId: params.userId, tenantId: params.tenantId },
              source: 'event-center',
            }).catch(() => {});
          } catch {}
        }
        break;

      case 'REVOKE_ALL_SESSIONS':
        if (params.userId) {
          try {
            const { sessionCenter } = require('../session/session-center');
            await sessionCenter.revokeAll(params.tenantId, params.userId);
            logger.warn('[event-center] REVOKE_ALL_SESSIONS', { userId: params.userId });

            await writeSecurityLog({
              eventType: SecurityEventType.TOKEN_INVALID,
              title: `吊销全部会话：${params.userId}`,
              detail: { action: 'REVOKE_ALL_SESSIONS', userId: params.userId, tenantId: params.tenantId },
              source: 'event-center',
            }).catch(() => {});
          } catch {}
        }
        break;

      case 'REVOKE_SESSION':
      case 'REQUIRE_REAUTH':
        logger.warn(`[event-center] ${action}`, { userId: params.userId });
        break;
    }
  }
}

/**
 * 获取安全事件统计（API 查询用）
 */
export async function getSecurityStats(tenantId: string): Promise<{
  recentEvents: number;
  blockedIPs: number;
  riskScore: number;
}> {
  const rows = await query<any>(
    `SELECT COUNT(*) as cnt FROM sys_security_log
     WHERE tenant_id = :tid AND create_time >= NOW() - INTERVAL 1 HOUR`,
    { tid: tenantId },
  );
  const recent = rows[0];

  let blockedIPs = 0;
  try {
    const { getRedisClient } = require('../../shared/utils/redis');
    const redis = getRedisClient();
    if (redis) {
      const keys = await redis.keys('security:blocked_ip:*');
      blockedIPs = keys.length;
    }
  } catch {}

  return {
    recentEvents: Number(recent?.cnt ?? 0),
    blockedIPs,
    riskScore: 0, // 需要更复杂的聚合计算
  };
}
