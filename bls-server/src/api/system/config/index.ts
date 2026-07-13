import { getDb } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { invalidateConfigCache } from '../../../config/dynamic-config';
import { logger } from '../../../core/logger';

// P14: fail-closed tenantId
function getTenantOrFail(): string {
  const tid = getCurrentTenantId();
  if (!tid) throw new Error('TENANT_CONTEXT_MISSING');
  return tid;
}

export const config = {
  table: 'sys_config', pkField: 'config_id',
  searchFields: ['config_key', 'config_name'],
  name: '系统参数', permPrefix: 'system:config', softDelete: false,
  /** P14: 写操作后清除 Redis 缓存 (fail-closed) */
  onWrite: () => {
    try {
      const tid = getTenantOrFail();
      invalidateConfigCache(tid).catch(() => {});
    } catch (err) {
      logger.warn('[config] onWrite failed', { error: String(err) });
    }
  },
};

export class ConfigService {
  async getSilentBooleanConfig(configKey: string, defaultValue = true): Promise<boolean> {
    const config = await this.findByKey(configKey);
    if (!config?.configValue) return defaultValue;
    return config.configValue === '1' || config.configValue === 'true';
  }
  async isMultiLoginEnabled() { return this.getSilentBooleanConfig('sys.login.multiDevice', true); }

  private async findByKey(key: string) {
    const db = (await getDb()) as any;
    const tid = getCurrentTenantId() ?? '000000';
    const row = await db.selectFrom('sys_config').selectAll()
      .where('config_key', '=', key).where('deleted', '=', 0)
      .where('tenant_id', '=', tid).limit(1).executeTakeFirst();
    if (row) return row;
    if (tid !== '000000') {
      return db.selectFrom('sys_config').selectAll()
        .where('config_key', '=', key).where('deleted', '=', 0)
        .where('tenant_id', '=', '000000').limit(1).executeTakeFirst();
    }
    return null;
  }
}

// P14: publicSystem 排除敏感配置
const SYS_KEYS = ['sys.app.name','sys.demo.enabled','sys.upload.maxSize','sys.version','sys.app.logo','sys.user.defaultAvatar'];
async function fetchSystemConfigs() {
  const svc = new ConfigService();
  const items = await Promise.all(SYS_KEYS.map((k: string) => (svc as any).findByKey(k)));
  return items.filter(Boolean);
}
export const current = () => fetchSystemConfigs();
export const publicTheme = () => (new ConfigService() as any).findByKey('theme.default');
export const publicSystem = () => fetchSystemConfigs();
