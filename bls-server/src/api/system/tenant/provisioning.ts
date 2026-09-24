/**
 * 租户 provisioning（阶段一）
 *
 * 把“创建租户”从单条 INSERT 升级为**事务化 provisioning**：
 *
 *   1. 校验 packageId 存在且已启用
 *   2. 规范化 + 校验 domainName（全局唯一）
 *   3. 创建 sys_tenant
 *   4. 创建租户默认管理员角色（tenant_admin）+ 从 sys_package_menu 初始化 sys_role_menu
 *   5. 创建默认管理员用户（Argon2id）+ sys_user_role
 *   6. 从平台租户复制 sys_config / sys_theme_config 作为租户默认配置
 *
 * 任一步骤失败 → 整个事务回滚，不会留下半个租户。
 * 外部通过 `provisionTenantIdempotent()` 以 Idempotency-Key 保证不重复建租户。
 */
import { getDb } from '../../../core/database';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { hashPasswordCanonical } from '../../../shared/utils/password';
import { AppError, ConflictError, ValidationError } from '../../../core/errors';
import { getRedisClient } from '../../../shared/utils/redis';
import { PLATFORM_TENANT_ID } from '../../../shared/constants/tenant';
import { logger } from '../../../core/logger';

const IDEM_PREFIX = 'tenant:provision:idem:';
const IDEM_PROCESSING_TTL = 900;      // 15 分钟内视为“处理中”
const IDEM_RESULT_TTL = 24 * 60 * 60; // 结果保留 24 小时

/** 域名格式：允许 localhost，或至少两段的标准域名 */
const DOMAIN_RE = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const EXPIRE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

export interface ProvisionTenantInput {
  tenantName: string;
  domainName?: string | null;
  packageId: string;
  contactUser?: string | null;
  contactPhone?: string | null;
  expireTime?: string | null;
  remark?: string | null;
  adminUsername: string;
  /** 前端已按历史契约做过 MD5 的密码；非 32 位十六进制时后端再 MD5 */
  adminPassword: string;
  adminNickname?: string | null;
  adminEmail?: string | null;
}

export interface ProvisionTenantResult {
  tenantId: string;
  adminUserId: string;
  adminRoleId: string;
  domainName: string | null;
  idempotent?: boolean;
}

/** 域名规范化：去协议 / 去端口 / 去路径 / 小写 / 去尾点 */
export function normalizeDomainName(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  let d = String(raw).trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // scheme://
  d = d.split('/')[0] ?? '';                     // path
  d = d.replace(/:\d+$/, '');                    // port
  d = d.replace(/\.+$/, '');                     // trailing dots
  if (!d) return null;
  if (d.length > 253) throw new ValidationError('域名长度不能超过 253 个字符');
  if (d === 'localhost') return d;
  if (!DOMAIN_RE.test(d)) throw new ValidationError(`域名格式不正确：${d}`);
  return d;
}

/** expire_time 规范化 + 真实日期校验（拒绝 2026-02-31 之类） */
export function normalizeExpireTime(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (!EXPIRE_RE.test(text)) {
    throw new ValidationError('expireTime 格式不正确，应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss');
  }
  const normalized = text.replace('T', ' ');
  const full = normalized.length === 10
    ? `${normalized} 23:59:59`
    : normalized.length === 16
      ? `${normalized}:00`
      : normalized;

  const [y, m, d] = full.slice(0, 10).split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    throw new ValidationError('expireTime 不是有效日期');
  }
  const parsed = new Date(full.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) throw new ValidationError('expireTime 不是有效日期');
  return full;
}

interface ProvisionContext {
  db: any;
  trx: any;
  tenantId: string;
  roleId: string;
  userId: string;
  domain: string | null;
}

/** 创建租户默认管理员角色，并从套餐菜单初始化授权 */
async function createDefaultAdminRole(ctx: ProvisionContext): Promise<void> {
  const { trx, tenantId, roleId } = ctx;
  await trx.insertInto('sys_role').values({
    role_id: roleId,
    tenant_id: tenantId,
    role_name: '租户管理员',
    role_key: 'tenant_admin',
    data_scope: 'TENANT',
    sort_num: 1,
    status: '0',
    remark: '租户 provisioning 创建的默认管理员角色',
    deleted: 0,
  }).execute();
}

async function initRoleMenusFromPackage(ctx: ProvisionContext, packageId: string): Promise<void> {
  const { trx, roleId } = ctx;
  const pkgMenus: Array<{ menu_id: string }> = await trx
    .selectFrom('sys_package_menu')
    .select('menu_id')
    .where('package_id', '=', packageId)
    .execute();
  if (pkgMenus.length === 0) return;
  await trx.insertInto('sys_role_menu')
    .values(pkgMenus.map((r) => ({ role_id: roleId, menu_id: r.menu_id })))
    .execute();
}

async function createDefaultAdminUser(ctx: ProvisionContext, input: ProvisionTenantInput): Promise<void> {
  const { trx, tenantId, userId } = ctx;
  const hashed = await hashPasswordCanonical(input.adminPassword ?? '');

  await trx.insertInto('sys_user').values({
    user_id: userId,
    tenant_id: tenantId,
    username: input.adminUsername,
    password: hashed,
    password_algorithm: 'argon2id',
    nickname: input.adminNickname?.trim() || input.adminUsername,
    real_name: input.adminNickname?.trim() || null,
    email: input.adminEmail?.trim() || null,
    gender: '2',
    is_admin: '1',
    status: '0',
    remark: '租户 provisioning 创建的默认管理员',
    deleted: 0,
  }).execute();

  await trx.insertInto('sys_user_role').values({ user_id: userId, role_id: ctx.roleId }).execute();
}

/** 复制平台租户的 sys_config 作为新租户默认配置 */
async function initTenantConfigs(ctx: ProvisionContext): Promise<void> {
  const { trx, tenantId } = ctx;
  const rows: any[] = await trx.selectFrom('sys_config')
    .select(['config_key', 'config_value', 'config_name', 'config_type', 'status', 'remark'])
    .where('tenant_id', '=', PLATFORM_TENANT_ID)
    .where('deleted', '=', 0)
    .execute();
  if (rows.length === 0) return;
  await trx.insertInto('sys_config').values(rows.map((r) => ({
    config_id: generateSnowflakeId(),
    tenant_id: tenantId,
    config_key: r.config_key,
    config_value: r.config_value,
    config_name: r.config_name,
    config_type: r.config_type,
    status: r.status ?? '0',
    remark: r.remark ?? null,
    deleted: 0,
  }))).execute();
}

/** 复制平台主题，缺省时创建一条默认主题 */
async function initTenantTheme(ctx: ProvisionContext): Promise<void> {
  const { trx, tenantId } = ctx;
  const rows: any[] = await trx.selectFrom('sys_theme_config')
    .selectAll()
    .where('tenant_id', '=', PLATFORM_TENANT_ID)
    .where('deleted', '=', 0)
    .execute();

  if (rows.length === 0) {
    await trx.insertInto('sys_theme_config').values({
      theme_id: generateSnowflakeId(),
      tenant_id: tenantId,
      nav_theme: 'light',
      color_primary: '#1677ff',
      layout: 'mix',
      content_width: 'Fluid',
      fixed_header: 0,
      fix_siderbar: 1,
      color_weak: 0,
      split_menus: 0,
      sider_menu_type: 'sub',
      status: '0',
      deleted: 0,
    }).execute();
    return;
  }

  const strip = (row: any) => {
    const clone: Record<string, unknown> = { ...row };
    delete clone.theme_id;
    delete clone.create_time;
    delete clone.update_time;
    return clone;
  };
  await trx.insertInto('sys_theme_config')
    .values(rows.map((r) => ({ ...strip(r), theme_id: generateSnowflakeId(), tenant_id: tenantId })))
    .execute();
}

/**
 * 事务化创建租户（不带幂等键，请优先使用 provisionTenantIdempotent）。
 */
export async function provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  const tenantName = String(input.tenantName ?? '').trim();
  if (!tenantName) throw new ValidationError('tenantName 不能为空');
  const packageId = String(input.packageId ?? '').trim();
  if (!packageId) throw new ValidationError('packageId 不能为空');
  const adminUsername = String(input.adminUsername ?? '').trim();
  if (!adminUsername) throw new ValidationError('adminUsername 不能为空');
  if (!input.adminPassword) throw new ValidationError('adminPassword 不能为空');

  const domain = normalizeDomainName(input.domainName);
  const expireTime = normalizeExpireTime(input.expireTime);

  const db = (await getDb()) as any;

  const result: ProvisionTenantResult = await db.transaction().execute(async (trx: any) => {
    // 1. 套餐必须存在且启用
    const pkg = await trx.selectFrom('sys_package').select(['package_id', 'status'])
      .where('package_id', '=', packageId).executeTakeFirst();
    if (!pkg) throw new ValidationError('套餐不存在');
    if (String(pkg.status) !== '0') throw new ValidationError('套餐已停用，无法创建租户');

    // 2. 域名全局唯一（uk_tenant_domain）
    if (domain) {
      const dup = await trx.selectFrom('sys_tenant').select('tenant_id')
        .where('domain_name', '=', domain).executeTakeFirst();
      if (dup) throw new ConflictError(`域名已被占用：${domain}`);
    }

    const tenantId = generateSnowflakeId();
    const roleId = generateSnowflakeId();
    const userId = generateSnowflakeId();
    const ctx: ProvisionContext = { db, trx, tenantId, roleId, userId, domain };

    // 3. sys_tenant
    await trx.insertInto('sys_tenant').values({
      tenant_id: tenantId,
      tenant_name: tenantName,
      package_id: packageId,
      expire_time: expireTime,
      domain_name: domain,
      contact_user: input.contactUser?.trim() || null,
      contact_phone: input.contactPhone?.trim() || null,
      status: '0',
      offboard_status: 'none',
      remark: input.remark ?? null,
      deleted: 0,
    }).execute();

    // 4. 默认管理员角色 + 套餐菜单授权
    await createDefaultAdminRole(ctx);
    await initRoleMenusFromPackage(ctx, packageId);

    // 5. 默认管理员用户 + 用户角色
    await createDefaultAdminUser(ctx, input);

    // 6. 租户级默认配置
    await initTenantConfigs(ctx);
    await initTenantTheme(ctx);

    return { tenantId, adminUserId: userId, adminRoleId: roleId, domainName: domain };
  });

  logger.info('[tenant] provisioned', {
    tenantId: result.tenantId,
    packageId,
    domain: result.domainName,
  });
  return result;
}

/**
 * 带幂等键的 provisioning。
 *
 * - 必须携带 Idempotency-Key；Redis 不可用 → 503（fail-closed）
 * - 相同 key 的重复请求返回首次结果（idempotent: true）
 * - 相同 key 并发请求 → 40903
 */
export async function provisionTenantIdempotent(
  idempotencyKey: string,
  input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
  const key = String(idempotencyKey ?? '').trim();
  if (!key) throw new ValidationError('缺少 Idempotency-Key 请求头');
  if (key.length > 128) throw new ValidationError('Idempotency-Key 长度不能超过 128');

  const client = getRedisClient();
  if (!client) throw new AppError('幂等服务不可用（Redis 未启用）', 503, 503);

  const redisKey = `${IDEM_PREFIX}${key}`;
  const acquired = await client.set(
    redisKey,
    JSON.stringify({ status: 'processing' }),
    'EX', IDEM_PROCESSING_TTL,
    'NX',
  );

  if (acquired !== 'OK') {
    const raw = await client.get(redisKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { status?: string; result?: ProvisionTenantResult };
        if (parsed.status === 'completed' && parsed.result) {
          return { ...parsed.result, idempotent: true };
        }
      } catch { /* 继续按“处理中”处理 */ }
    }
    throw new AppError('相同 Idempotency-Key 请求正在处理中', 409, 40903);
  }

  try {
    const result = await provisionTenant(input);
    await client.set(redisKey, JSON.stringify({ status: 'completed', result }), 'EX', IDEM_RESULT_TTL);
    return result;
  } catch (error) {
    // 失败时释放幂等键，允许修复后重试
    await client.del(redisKey).catch(() => {});
    throw error;
  }
}
