/**
 * 集成测试（阶段七）
 *
 * 需要**真实的 MySQL + Redis**：
 *   1. 执行 sql/Init.sql 初始化
 *   2. 执行 bls-server/migrations 下的增量迁移
 *   3. INTEGRATION_TEST=true npm run test:integration
 *
 * 未设置 INTEGRATION_TEST=true 时整个文件跳过，保证本地/无依赖环境不失败。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ENABLED = process.env.INTEGRATION_TEST === 'true';
const suite = ENABLED ? describe : describe.skip;

/** md5('123456')，与 sql/Init.sql 的种子密码一致 */
const MD5_123456 = 'e10adc3949ba59abbe56e057f20f883e';

let execute: any;
let queryOne: any;
let query: any;
let closeDatabase: any;
let closeRedis: any;
let authService: any;
let provisionTenant: any;

suite('integration — 认证 / 租户 / 套餐 / 配额 / 审计', () => {
  beforeAll(async () => {
    const db = await import('../../src/core/database');
    execute = db.execute;
    query = db.query;
    queryOne = db.queryOne;
    closeDatabase = db.closeDatabase;

    const redis = await import('../../src/shared/utils/redis');
    closeRedis = redis.closeRedis;

    const auth = await import('../../src/api/auth');
    authService = new auth.AuthService();

    const provisioning = await import('../../src/api/system/tenant/provisioning');
    provisionTenant = provisioning.provisionTenant;
  });

  afterAll(async () => {
    await closeDatabase?.().catch(() => undefined);
    await closeRedis?.().catch(() => undefined);
  });

  // ---------- 认证 ----------

  it('种子租户管理员可以登录（MD5 → Argon2id 迁移路径）', async () => {
    const result = await authService.loginByTenant('100000', 'admin', MD5_123456);
    expect(result.token).toMatch(/^Bearer /);
    expect(result.refreshToken).toBeTruthy();
    // 登录后密码算法应被升级为 argon2id
    const user = await queryOne(
      `SELECT password_algorithm AS algorithm FROM sys_user WHERE tenant_id='100000' AND username='admin'`,
    );
    expect(user.algorithm).toBe('argon2id');
  });

  it('错误密码被拒绝（401）', async () => {
    await expect(authService.loginByTenant('100000', 'admin', 'wrong-password'))
      .rejects.toMatchObject({ status: 401 });
  });

  // ---------- 租户 provisioning / 生命周期 ----------

  it('provisioning 的租户可立即用其管理员登录；停用 / 过期后立即拒绝', async () => {
    const suffix = Date.now();
    const created = await provisionTenant({
      tenantName: `集成测试租户 ${suffix}`,
      domainName: `it-${suffix}.example.com`,
      packageId: 'P100',
      adminUsername: 'itadmin',
      adminPassword: MD5_123456,
    });

    try {
      // 1. 可以登录
      const ok = await authService.loginByTenant(created.tenantId, 'itadmin', MD5_123456);
      expect(ok.token).toBeTruthy();

      // 2. 默认管理员角色 + 套餐菜单授权已建立
      const roleMenus = await query(
        `SELECT menu_id FROM sys_role_menu WHERE role_id = :rid`,
        { rid: created.adminRoleId },
      );
      expect(roleMenus.length).toBeGreaterThan(0);

      // 3. 停用 → 登录被拒
      await execute(`UPDATE sys_tenant SET status='1' WHERE tenant_id = :tid`, { tid: created.tenantId });
      await expect(authService.loginByTenant(created.tenantId, 'itadmin', MD5_123456))
        .rejects.toMatchObject({ status: 401 });

      // 4. 恢复但设置为已过期 → 登录被拒
      await execute(
        `UPDATE sys_tenant SET status='0', expire_time = DATE_SUB(NOW(), INTERVAL 1 DAY) WHERE tenant_id = :tid`,
        { tid: created.tenantId },
      );
      await expect(authService.loginByTenant(created.tenantId, 'itadmin', MD5_123456))
        .rejects.toMatchObject({ status: 401 });

      // 5. 未过期 → 可以登录
      await execute(
        `UPDATE sys_tenant SET expire_time = DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE tenant_id = :tid`,
        { tid: created.tenantId },
      );
      const again = await authService.loginByTenant(created.tenantId, 'itadmin', MD5_123456);
      expect(again.token).toBeTruthy();
    } finally {
      // 清理
      await execute(`DELETE FROM sys_user_role WHERE user_id = :uid`, { uid: created.adminUserId }).catch(() => undefined);
      await execute(`DELETE FROM sys_role_menu WHERE role_id = :rid`, { rid: created.adminRoleId }).catch(() => undefined);
      await execute(`DELETE FROM sys_user WHERE tenant_id = :tid`, { tid: created.tenantId }).catch(() => undefined);
      await execute(`DELETE FROM sys_role WHERE tenant_id = :tid`, { tid: created.tenantId }).catch(() => undefined);
      await execute(`DELETE FROM sys_config WHERE tenant_id = :tid`, { tid: created.tenantId }).catch(() => undefined);
      await execute(`DELETE FROM sys_theme_config WHERE tenant_id = :tid`, { tid: created.tenantId }).catch(() => undefined);
      await execute(`DELETE FROM sys_tenant WHERE tenant_id = :tid`, { tid: created.tenantId }).catch(() => undefined);
    }
  });

  it('域名唯一性：重复 domain 会被拒绝', async () => {
    const suffix = Date.now();
    const domain = `dup-${suffix}.example.com`;
    const first = await provisionTenant({
      tenantName: '重复域名 A', domainName: domain, packageId: 'P100',
      adminUsername: 'dupa', adminPassword: MD5_123456,
    });
    try {
      await expect(provisionTenant({
        tenantName: '重复域名 B', domainName: domain, packageId: 'P100',
        adminUsername: 'dupb', adminPassword: MD5_123456,
      })).rejects.toMatchObject({ status: 409 });
    } finally {
      await execute(`DELETE FROM sys_user_role WHERE user_id = :uid`, { uid: first.adminUserId }).catch(() => undefined);
      await execute(`DELETE FROM sys_role_menu WHERE role_id = :rid`, { rid: first.adminRoleId }).catch(() => undefined);
      await execute(`DELETE FROM sys_user WHERE tenant_id = :tid`, { tid: first.tenantId }).catch(() => undefined);
      await execute(`DELETE FROM sys_role WHERE tenant_id = :tid`, { tid: first.tenantId }).catch(() => undefined);
      await execute(`DELETE FROM sys_config WHERE tenant_id = :tid`, { tid: first.tenantId }).catch(() => undefined);
      await execute(`DELETE FROM sys_theme_config WHERE tenant_id = :tid`, { tid: first.tenantId }).catch(() => undefined);
      await execute(`DELETE FROM sys_tenant WHERE tenant_id = :tid`, { tid: first.tenantId }).catch(() => undefined);
    }
  });

  // ---------- 套餐权益与配额 ----------

  it('套餐权益与配额已初始化，且套餐外功能为关闭', async () => {
    const entitlementService = (await import('../../src/services/entitlement-service')).entitlementService;
    const ent = await entitlementService.getEntitlements('100000');
    expect(ent.packageId).toBe('P100');
    expect(ent.features['feature.ai.chat']).toBe(true);
    expect(ent.features['feature.openapi']).toBe(true);
    expect(ent.features['feature.audit.export']).toBe(false);
    expect(ent.features['feature.custom_domain']).toBe(false);
    expect(ent.quotas['max_users']?.limit).toBe(50);
    expect(ent.quotas['max_api_keys']?.limit).toBe(5);
  });

  it('配额消费是原子的：并发请求不能突破上限', async () => {
    const quotaService = (await import('../../src/services/quota-service')).quotaService;

    // 归零后并发消费 60 次（P100 的 max_users = 50）
    await execute(
      `INSERT INTO sys_tenant_quota_usage (id, tenant_id, quota_key, period_key, used)
       VALUES ('it-quota-1', '100000', 'max_users', 'total', 0)
       ON DUPLICATE KEY UPDATE used = 0`,
    ).catch(async () => {
      await execute(`UPDATE sys_tenant_quota_usage SET used = 0 WHERE tenant_id='100000' AND quota_key='max_users' AND period_key='total'`);
    });

    const results = await Promise.allSettled(
      Array.from({ length: 60 }, () => quotaService.consume('100000', 'max_users', 1)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

    expect(ok).toBe(50);
    expect(rejected.every((r) => (r.reason as any)?.code === 40905)).toBe(true);

    const state = await quotaService.getState('100000', 'max_users');
    expect(state.used).toBe(50);
    expect(state.remaining).toBe(0);

    // 清理
    await execute(`UPDATE sys_tenant_quota_usage SET used = 0 WHERE tenant_id='100000' AND quota_key='max_users'`);
  });

  // ---------- 审计（DDL 漂移修复验证） ----------

  it('sys_security_log 可以写入（log_id + source 已对齐）', async () => {
    const { writeSecurityLog, SecurityEventType } = await import('../../src/core/security-audit');
    const title = `integration-security-${Date.now()}`;
    await writeSecurityLog({
      eventType: SecurityEventType.SECURITY_VALIDATION_FAILED,
      title,
      detail: { source: 'integration-test' },
      source: 'integration',
    });

    const row = await queryOne(
      `SELECT log_id AS logId, source, event_type AS eventType FROM sys_security_log
       WHERE title = :title ORDER BY create_time DESC LIMIT 1`,
      { title },
    );
    expect(row?.logId).toBeTruthy();
    expect(row?.source).toBe('integration');
    expect(row?.eventType).toBe('SECURITY_VALIDATION_FAILED');
  });

  it('sys_login_log 可以写入', async () => {
    const { writeLoginLog } = await import('../../src/core/audit');
    await writeLoginLog({
      actor: {
        tenantId: '100000', userId: null, username: 'integration-probe',
        clientIp: '127.0.0.1', userAgent: 'vitest', requestId: 'it-request',
      },
      loginType: 'password',
      loginStatus: '0',
      failReason: 'integration test',
    });

    const row = await queryOne(
      `SELECT log_id AS logId, login_status AS loginStatus FROM sys_login_log
       WHERE username = 'integration-probe' ORDER BY login_time DESC LIMIT 1`,
    );
    expect(row?.logId).toBeTruthy();
    expect(String(row?.loginStatus)).toBe('0');
  });

  it('sys_operation_log 可以写入', async () => {
    const { writeOperationLog } = await import('../../src/core/audit');
    await writeOperationLog({
      actor: {
        tenantId: '100000', userId: 'u-it', username: 'integration-probe',
        clientIp: '127.0.0.1', userAgent: 'vitest', requestId: 'it-request',
      },
      moduleName: 'integration',
      businessType: 'CREATE',
      title: 'integration operation log',
      success: '1',
      responseStatus: 200,
    });

    const row = await queryOne(
      `SELECT log_id AS logId, title, module_name AS moduleName FROM sys_operation_log
       WHERE module_name = 'integration' ORDER BY operator_time DESC LIMIT 1`,
    );
    expect(row?.logId).toBeTruthy();
    expect(row?.title).toBe('integration operation log');
  });

  // ---------- 外部 API（API Key） ----------

  it('API Key：创建后可解析、撤销后立即失效，且密文落库', async () => {
    const { apiKeyService } = await import('../../src/services/api-key-service');

    const created = await apiKeyService.create({
      tenantId: '100000',
      name: `it-key-${Date.now()}`,
      scopes: ['read'],
    });

    try {
      const stored = await queryOne(
        `SELECT encrypted_secret AS encryptedSecret, key_hash AS keyHash, key_id AS keyId
         FROM sys_api_key WHERE api_key_id = :id`,
        { id: created.apiKeyId },
      );
      expect(stored.encryptedSecret.startsWith('enc:v1:')).toBe(true);
      expect(stored.encryptedSecret).not.toContain(created.secret);

      const resolved = await apiKeyService.resolve(created.apiKey);
      expect(resolved?.secret).toBe(created.secret);
      expect(resolved?.record.tenantId).toBe('100000');

      // 撤销后立即失效
      expect(await apiKeyService.revoke('100000', created.apiKeyId)).toBe(true);
      expect(await apiKeyService.resolve(created.keyId)).toBeNull();
    } finally {
      await execute(`DELETE FROM sys_api_key WHERE api_key_id = :id`, { id: created.apiKeyId }).catch(() => undefined);
      await execute(
        `DELETE FROM sys_tenant_quota_usage WHERE tenant_id='100000' AND quota_key='max_api_keys' AND period_key='total'`,
      ).catch(() => undefined);
    }
  });
});
