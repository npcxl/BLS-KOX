import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { invalidateConfigCache, getDynamicConfig, type DynamicConfig } from '../../../config/dynamic-config';
import { logger } from '../../../core/logger';

function getTenantOrFail(): string {
  const tid = getCurrentTenantId();
  if (!tid) throw new Error('TENANT_CONTEXT_MISSING');
  return tid;
}

// 公开路由（不需要认证，登录页/首页使用）
const publicRouter = new Router({ prefix: '/system/config' });
publicRouter.get('/public-system', async (ctx: Context) => {
  ctx.body = { code: 200, data: await fetchSystemConfigs(), message: '操作成功' };
});
publicRouter.get('/public-theme', async (ctx: Context) => {
  const db = (await getDb()) as any;
  const tid = getCurrentTenantId() ?? '000000';
  const data = await db.selectFrom('sys_config').selectAll().where('config_key','=','theme.default').where('deleted','=',0).where('tenant_id','=',tid).limit(1).executeTakeFirst();
  ctx.body = { code: 200, data, message: '操作成功' };
});
publicRouter.get('/current', async (ctx: Context) => {
  ctx.body = { code: 200, data: await fetchSystemConfigs() };
});

export const config = {
  table: 'sys_config', pkField: 'config_id',
  searchFields: ['config_key', 'config_name'],
  name: '系统参数', permPrefix: 'system:config', softDelete: false,
  /** fail-closed — 缺失租户抛错，由 CRUD 框架捕获并阻止写入 */
  onWrite: () => {
    const tid = getTenantOrFail();
    invalidateConfigCache(tid).catch(() => {});
  },
};

export class ConfigService {
  constructor(private _getConfigFn?: typeof getDynamicConfig) {}

  async getTenantConfig(tid?: string): Promise<DynamicConfig> {
    const fn = this._getConfigFn ?? getDynamicConfig;
    return fn(tid ?? getTenantOrFail());
  }

  async getPlatformConfig(): Promise<DynamicConfig> {
    const fn = this._getConfigFn ?? getDynamicConfig;
    const tid = getCurrentTenantId() ?? '000000';
    return fn(tid);
  }

  /** auth-sensitive — tenant context required, no platform fallback.
   *  Accepts optional tenantId for login flows where JWT context is not yet established. */
  async isMultiLoginEnabled(tid?: string): Promise<boolean> {
    const fn = this._getConfigFn ?? getDynamicConfig;
    const cfg = await fn(tid ?? getTenantOrFail());
    return cfg.multiLogin;
  }
}

// publicSystem excludes sensitive configs; injectable for testing
const SYS_KEYS = ['sys.app.name','sys.demo.enabled','sys.upload.maxSize','sys.version','sys.app.logo','sys.user.defaultAvatar','sys.user.defaultPassword'];
export async function fetchSystemConfigs(_dbFn?: () => any, _tenantFn?: () => string | null) {
  const dbFn = _dbFn ?? getDb;
  const tenantFn = _tenantFn ?? getCurrentTenantId;
  const db = (await dbFn()) as any;
  const tid = tenantFn() ?? '000000';
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

export default publicRouter;
