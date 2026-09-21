/**
 * EntitlementService（阶段三）
 *
 * 套餐权益是**唯一的**功能开关来源：
 *   feature.ai.chat / feature.webhook / feature.openapi /
 *   feature.audit.export / feature.custom_domain
 *
 * 约束：
 *   - 不允许各业务接口自行拼 SQL 判断功能开关，一律通过本服务；
 *   - 套餐变更**立即生效**（不缓存，直接读库）；
 *   - 未配置的 feature 视为关闭（fail-closed）。
 */
import { query, queryOne } from '../core/database';
import { EntitlementError } from '../core/errors';
import { ALL_QUOTA_KEYS, ALL_FEATURE_KEYS, type FeatureKey, type QuotaPeriod } from '../shared/constants/entitlements';

export interface TenantEntitlements {
  tenantId: string;
  packageId: string | null;
  /** 功能开关：未出现的 key 一律视为 false */
  features: Record<string, boolean>;
  /** 配额上限：未出现的 key 视为未定义（由 QuotaService 决定语义） */
  quotas: Record<string, { limit: number; period: QuotaPeriod }>;
}

export class EntitlementService {
  /** 租户当前套餐 */
  async getPackageId(tenantId: string): Promise<string | null> {
    if (!tenantId) return null;
    const row = await queryOne<{ packageId: string | null }>(
      `SELECT package_id AS packageId FROM sys_tenant WHERE tenant_id = :tid LIMIT 1`,
      { tid: tenantId },
    );
    return row?.packageId ? String(row.packageId) : null;
  }

  /** 读取租户完整的权益快照 */
  async getEntitlements(tenantId: string): Promise<TenantEntitlements> {
    const packageId = await this.getPackageId(tenantId);
    const features: Record<string, boolean> = {};
    const quotas: Record<string, { limit: number; period: QuotaPeriod }> = {};

    // 全部功能默认关闭（fail-closed）
    for (const key of ALL_FEATURE_KEYS) features[key] = false;

    if (packageId) {
      const featureRows = await query<{ featureKey: string; enabled: string }>(
        `SELECT feature_key AS featureKey, enabled FROM sys_package_feature WHERE package_id = :pid`,
        { pid: packageId },
      );
      for (const row of featureRows) {
        features[String(row.featureKey)] = String(row.enabled) === '1';
      }

      const quotaRows = await query<{ quotaKey: string; quotaLimit: number | string; period: string }>(
        `SELECT quota_key AS quotaKey, quota_limit AS quotaLimit, period
         FROM sys_package_quota WHERE package_id = :pid`,
        { pid: packageId },
      );
      for (const row of quotaRows) {
        quotas[String(row.quotaKey)] = {
          limit: Number(row.quotaLimit),
          period: (String(row.period) || 'total') as QuotaPeriod,
        };
      }
    }

    return { tenantId, packageId, features, quotas };
  }

  /** 是否拥有某功能 */
  async hasFeature(tenantId: string, featureKey: FeatureKey | string): Promise<boolean> {
    const entitlements = await this.getEntitlements(tenantId);
    return entitlements.features[featureKey] === true;
  }

  /** 断言拥有某功能，否则抛 403 EntitlementError */
  async assertFeature(tenantId: string, featureKey: FeatureKey | string, label?: string): Promise<void> {
    const ok = await this.hasFeature(tenantId, featureKey);
    if (!ok) {
      throw new EntitlementError(
        `当前套餐不包含「${label ?? featureKey}」功能，请升级套餐`,
        { feature: featureKey, tenantId },
      );
    }
  }

  /** 列出该租户套餐已定义的配额 key（用于配额查询 API） */
  async getDefinedQuotaKeys(tenantId: string): Promise<string[]> {
    const entitlements = await this.getEntitlements(tenantId);
    return ALL_QUOTA_KEYS.filter((k) => entitlements.quotas[k] !== undefined);
  }
}

export const entitlementService = new EntitlementService();
