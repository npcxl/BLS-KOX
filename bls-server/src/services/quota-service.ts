/**
 * QuotaService（阶段三）
 *
 * 所有配额消费都必须经过本服务，禁止在业务接口里复制配额逻辑。
 *
 * 关键性质：
 *   - **原子**：用一条带条件的 `UPDATE ... WHERE used + :delta <= :limit` 完成
 *     “检查 + 扣减”，由数据库行锁保证并发安全（并发请求不可能突破配额）。
 *   - **幂等**：可选 `idempotencyKey`，相同的 key 只消费一次（Redis SETNX）。
 *   - **可回退**：删除资源时 `release()` 归还额度（不会小于 0）。
 *   - **降级不删数据**：降级后 `limit` 变小，已超额的租户无法再新增（used + delta > limit），
 *     但已有数据保持不变。
 */
import { execute, query, queryOne } from '../core/database';
import { AppError, QuotaExceededError } from '../core/errors';
import { getRedisClient } from '../shared/utils/redis';
import { generateSnowflakeId } from '../shared/utils/snowflake';
import {
  ALL_QUOTA_KEYS,
  QUOTA_LABELS,
  QUOTA_PERIODS,
  type QuotaKey,
  type QuotaPeriod,
} from '../shared/constants/entitlements';

const IDEM_TTL_SECONDS = 24 * 60 * 60;

export interface QuotaDef {
  quotaKey: string;
  limit: number;
  period: QuotaPeriod;
}

export interface QuotaState {
  quotaKey: string;
  period: QuotaPeriod;
  periodKey: string;
  /** null 表示不限 */
  limit: number | null;
  used: number;
  /** null 表示不限 */
  remaining: number | null;
  unlimited: boolean;
}

export interface ConsumeOptions {
  /** 幂等键（同 key 只消费一次） */
  idempotencyKey?: string;
  /** 便于日志定位的调用来源 */
  reason?: string;
}

export class QuotaService {
  /** 计算计量周期键 */
  periodKey(quotaKey: string, period: QuotaPeriod, now: Date = new Date()): string {
    if (period === 'monthly') {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    if (period === 'daily') {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    return 'total';
  }

  /** 查询租户套餐里对某配额的定义（未定义 → null，视为不限） */
  async getQuotaDef(tenantId: string, quotaKey: string): Promise<QuotaDef | null> {
    const row = await queryOne<{ quotaKey: string; quotaLimit: number | string; period: string }>(
      `SELECT q.quota_key AS quotaKey, q.quota_limit AS quotaLimit, q.period
       FROM sys_tenant t
       JOIN sys_package_quota q ON q.package_id = t.package_id
       WHERE t.tenant_id = :tid AND q.quota_key = :qk
       LIMIT 1`,
      { tid: tenantId, qk: quotaKey },
    );
    if (!row) return null;
    return {
      quotaKey: String(row.quotaKey),
      limit: Number(row.quotaLimit),
      period: (String(row.period) || 'total') as QuotaPeriod,
    };
  }

  private async getUsed(tenantId: string, quotaKey: string, periodKey: string): Promise<number> {
    const row = await queryOne<{ used: number | string }>(
      `SELECT used FROM sys_tenant_quota_usage
       WHERE tenant_id = :tid AND quota_key = :qk AND period_key = :pk LIMIT 1`,
      { tid: tenantId, qk: quotaKey, pk: periodKey },
    );
    return row ? Number(row.used) : 0;
  }

  /** 查询某配额的当前状态（不消费） */
  async getState(tenantId: string, quotaKey: string): Promise<QuotaState> {
    const def = await this.getQuotaDef(tenantId, quotaKey);
    const period = def?.period ?? QUOTA_PERIODS[quotaKey as QuotaKey] ?? 'total';
    const periodKey = this.periodKey(quotaKey, period);
    const used = await this.getUsed(tenantId, quotaKey, periodKey);
    const unlimited = !def || def.limit < 0;
    return {
      quotaKey,
      period,
      periodKey,
      limit: unlimited ? null : def.limit,
      used,
      remaining: unlimited ? null : Math.max(def.limit - used, 0),
      unlimited,
    };
  }

  private async ensureRow(tenantId: string, quotaKey: string, periodKey: string): Promise<void> {
    await execute(
      `INSERT IGNORE INTO sys_tenant_quota_usage (id, tenant_id, quota_key, period_key, used)
       VALUES (:id, :tid, :qk, :pk, 0)`,
      { id: generateSnowflakeId(), tid: tenantId, qk: quotaKey, pk: periodKey },
    );
  }

  /**
   * 原子消费配额。
   *
   * @throws QuotaExceededError (409 / 40905) 超出配额
   */
  async consume(
    tenantId: string,
    quotaKey: string,
    delta: number,
    options: ConsumeOptions = {},
  ): Promise<QuotaState> {
    if (!tenantId) throw new AppError('缺少租户上下文，禁止消费配额', 400, 400);
    const amount = Number(delta);
    if (!Number.isFinite(amount) || amount <= 0) {
      return this.getState(tenantId, quotaKey);
    }

    const client = options.idempotencyKey ? getRedisClient() : null;
    let idemKey: string | null = null;

    if (options.idempotencyKey) {
      if (!client) throw new AppError('配额幂等服务不可用（Redis 未启用）', 503, 503);
      idemKey = `quota:idem:${tenantId}:${options.idempotencyKey}`;
      const acquired = await client.set(idemKey, String(amount), 'EX', IDEM_TTL_SECONDS, 'NX');
      if (acquired !== 'OK') {
        // 幂等命中：不重复消费
        return this.getState(tenantId, quotaKey);
      }
    }

    try {
      const def = await this.getQuotaDef(tenantId, quotaKey);
      const period = def?.period ?? QUOTA_PERIODS[quotaKey as QuotaKey] ?? 'total';
      const periodKey = this.periodKey(quotaKey, period);
      const unlimited = !def || def.limit < 0;
      const limit = unlimited ? -1 : def.limit;

      await this.ensureRow(tenantId, quotaKey, periodKey);

      const result = await execute(
        `UPDATE sys_tenant_quota_usage
           SET used = used + :delta
         WHERE tenant_id = :tid AND quota_key = :qk AND period_key = :pk
           AND (:unlimited = 1 OR used + :delta <= :limit)`,
        {
          delta: amount,
          tid: tenantId,
          qk: quotaKey,
          pk: periodKey,
          unlimited: unlimited ? 1 : 0,
          limit,
        },
      );

      if (Number(result?.affectedRows ?? 0) === 0) {
        const used = await this.getUsed(tenantId, quotaKey, periodKey);
        throw new QuotaExceededError(
          `${QUOTA_LABELS[quotaKey] ?? quotaKey} 已超出套餐配额（${used}/${limit}）`,
          { quotaKey, limit, used, requested: amount, tenantId },
        );
      }

      return this.getState(tenantId, quotaKey);
    } catch (error) {
      // 失败时释放幂等键，允许修复后重试
      if (idemKey && client) await client.del(idemKey).catch(() => {});
      throw error;
    }
  }

  /** 归还配额（删除资源时调用），不会小于 0 */
  async release(tenantId: string, quotaKey: string, delta: number): Promise<void> {
    const amount = Number(delta);
    if (!tenantId || !Number.isFinite(amount) || amount <= 0) return;
    const def = await this.getQuotaDef(tenantId, quotaKey);
    const period = def?.period ?? QUOTA_PERIODS[quotaKey as QuotaKey] ?? 'total';
    const periodKey = this.periodKey(quotaKey, period);
    await execute(
      `UPDATE sys_tenant_quota_usage
         SET used = GREATEST(used - :delta, 0)
       WHERE tenant_id = :tid AND quota_key = :qk AND period_key = :pk`,
      { delta: amount, tid: tenantId, qk: quotaKey, pk: periodKey },
    );
  }

  /** 断言不会超配额（只检查，不消费），用于“更新前预检”场景 */
  async assertWithinLimit(tenantId: string, quotaKey: string, delta: number): Promise<void> {
    const state = await this.getState(tenantId, quotaKey);
    if (state.unlimited || state.limit === null) return;
    if (state.used + Number(delta) > state.limit) {
      throw new QuotaExceededError(
        `${QUOTA_LABELS[quotaKey] ?? quotaKey} 已超出套餐配额（${state.used}/${state.limit}）`,
        { quotaKey, limit: state.limit, used: state.used, requested: Number(delta), tenantId },
      );
    }
  }

  /** 一次性返回该租户全部配额的用量快照（供配额查询 API） */
  async snapshot(tenantId: string): Promise<QuotaState[]> {
    const tenant = await queryOne<{ packageId: string | null }>(
      `SELECT package_id AS packageId FROM sys_tenant WHERE tenant_id = :tid LIMIT 1`,
      { tid: tenantId },
    );
    const packageId = tenant?.packageId ? String(tenant.packageId) : null;

    const defs = packageId
      ? await query<{ quotaKey: string; quotaLimit: number | string; period: string }>(
          `SELECT quota_key AS quotaKey, quota_limit AS quotaLimit, period
           FROM sys_package_quota WHERE package_id = :pid`,
          { pid: packageId },
        )
      : [];
    const defMap = new Map(defs.map((d) => [String(d.quotaKey), d]));

    const usageRows = await query<{ quotaKey: string; periodKey: string; used: number | string }>(
      `SELECT quota_key AS quotaKey, period_key AS periodKey, used
       FROM sys_tenant_quota_usage WHERE tenant_id = :tid`,
      { tid: tenantId },
    );
    const usageMap = new Map(usageRows.map((r) => [`${r.quotaKey}::${r.periodKey}`, Number(r.used)]));

    const now = new Date();
    return ALL_QUOTA_KEYS.map((key) => {
      const def = defMap.get(key);
      const period = (def ? String(def.period) : QUOTA_PERIODS[key]) as QuotaPeriod;
      const periodKey = this.periodKey(key, period, now);
      const used = usageMap.get(`${key}::${periodKey}`) ?? 0;
      const unlimited = !def || Number(def.quotaLimit) < 0;
      return {
        quotaKey: key,
        period,
        periodKey,
        limit: unlimited ? null : Number(def!.quotaLimit),
        used,
        remaining: unlimited ? null : Math.max(Number(def!.quotaLimit) - used, 0),
        unlimited,
      };
    });
  }
}

export const quotaService = new QuotaService();
