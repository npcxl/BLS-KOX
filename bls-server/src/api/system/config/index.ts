import { getDb } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { invalidateConfigCache, getDynamicConfig, type DynamicConfig } from '../../../config/dynamic-config';
import { logger } from '../../../core/logger';

// P14: fail-closed — 缺失租户直接抛错，不由 onWrite 吞掉
function getTenantOrFail(): string {
  const tid = getCurrentTenantId();
  if (!tid) throw new Error('TENANT_CONTEXT_MISSING');
  return tid;
}

export const config = {
  table: 'sys_config', pkField: 'config_id',
  searchFields: ['config_key', 'config_name'],
  name: '系统参数', permPrefix: 'system:config', softDelete: false,
  /** P14: 写操作后清除 Redis 缓存 — 租户缺失时外抛，阻止写入 */
  onWrite: () => {
    const tid = getTenantOrFail();
    invalidateConfigCache(tid).catch(() => {});
  },
};

/** P14: 统一配置读取 — 通过 getDynamicConfig 保证解析一致 */
export class ConfigService {
  /** 强制租户配置读取 */
  async getTenantConfig(tid?: string): Promise<DynamicConfig> {
    return getDynamicConfig(tid ?? getTenantOrFail());
  }

  /** 公开平台配置读取（回退 000000） */
  async getPlatformConfig(): Promise<DynamicConfig> {
    const tid = getCurrentTenantId() ?? '000000';
    return getDynamicConfig(tid);
  }

  /** 兼容旧接口 */
  async isMultiLoginEnabled(): Promise<boolean> {
    const cfg = await getDynamicConfig(getCurrentTenantId() ?? '000000');
    return cfg.multiLogin;
  }
}

// P14: publicSystem 排除敏感配置
const SYS_KEYS = ['sys.app.name','sys.demo.enabled','sys.upload.maxSize','sys.version','sys.app.logo','sys.user.defaultAvatar'];
async function fetchSystemConfigs() {
  const db = (await getDb()) as any;
  const tid = getCurrentTenantId() ?? '000000';
  const items = await Promise.all(SYS_KEYS.map(k =>
    db.selectFrom('sys_config').selectAll().where('config_key','=',k).where('deleted','=',0).where('tenant_id','=',tid).limit(1).executeTakeFirst()
  ));
  return items.filter(Boolean);
}
export const current = () => fetchSystemConfigs();
export const publicTheme = async () => {
  const db = (await getDb()) as any;
  const tid = getCurrentTenantId() ?? '000000';
  return db.selectFrom('sys_config').selectAll().where('config_key','=','theme.default').where('deleted','=',0).where('tenant_id','=',tid).limit(1).executeTakeFirst();
};
export const publicSystem = () => fetchSystemConfigs();
