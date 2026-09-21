/**
 * 系统参数批量保存（**事务**）
 *
 *   POST /api/system/config/batch   { items: [{ configKey, configValue, ... }] }
 *
 * 为什么需要它：系统参数页的高级配置是多字段一起改（例如人机验证的
 * primaryProvider / secondaryProvider / secondaryType）。逐条 `PUT /edit` + `Promise.all`
 * 会出现「部分成功」——比如 provider 改成了 tianai 但 secondaryType 没落库，直接把登录锁死。
 * 这里在**单个事务**内完成全部变更，任一失败整体回滚。
 *
 * 保存前校验：变更后的有效配置若启用第二层 Tianai，会先做一次健康检查；
 * 不可用则拒绝保存（返回明确错误），避免保存后无人能登录。
 */
import Router from 'koa-router';
import type { Context } from 'koa';
import { z } from 'zod';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { invalidateConfigCache, MANAGED_CONFIG_KEYS, parseConfigValue } from '../../../config/dynamic-config';
import { env } from '../../../config/env';
import { generateSnowflakeId } from '../../../shared/utils/snowflake';
import { ValidationError } from '../../../core/errors';
import { logger } from '../../../core/logger';
import { TianaiProvider } from '../../../security/captcha/providers/tianai-provider';

const itemSchema = z.object({
  configKey: z.string().min(1).max(128),
  configValue: z.string().max(2048),
  configName: z.string().max(64).optional(),
  configType: z.string().max(32).optional(),
  remark: z.string().max(255).optional(),
});

const batchSchema = z.object({ items: z.array(itemSchema).min(1).max(50) });

type BatchItem = z.infer<typeof itemSchema>;

/** 只允许写受管键（避免通过该接口写任意 sys_config） */
export function assertManagedKeys(items: BatchItem[]): void {
  const managed = new Set<string>(MANAGED_CONFIG_KEYS);
  const unknown = items.filter((i) => !managed.has(i.configKey)).map((i) => i.configKey);
  if (unknown.length > 0) throw new ValidationError(`不支持批量修改的参数：${unknown.join(', ')}`);
}

/**
 * 保存前校验：把「库中的现有值 + 本次变更」合并成生效配置，若启用 Tianai 第二层则探活。
 * 可用性校验失败 → 抛错阻止保存（避免把登录锁死）。
 * 导出以便单测（注入 provider，避免真实网络请求）。
 */
export async function assertEffectiveCaptchaUsable(
  existing: Record<string, string>,
  items: BatchItem[],
  provider?: TianaiProvider,
): Promise<void> {
  const merged: Record<string, any> = { ...existing };
  for (const it of items) merged[it.configKey] = it.configValue;

  const cfg = parseConfigValue(merged);
  if (!cfg.loginCaptchaEnabled) return;      // 总开关关闭：无需校验上游
  if (!cfg.captchaTianaiEnabled) return;     // 本部署不启用 TIANAI：无需校验上游

  const baseUrl = (env.captcha.tianaiUrl ?? '').trim();
  if (!baseUrl) {
    throw new ValidationError(
      '未配置 TIANAI_BASE_URL（Koa 通过 Docker 内网访问 TIANAI Java 服务），无法启用图形验证码',
    );
  }
  const probe = provider ?? new TianaiProvider({ baseUrl, paths: env.captcha.tianaiPaths });
  const healthy = await probe.healthCheck();
  if (!healthy) {
    throw new ValidationError('TIANAI 验证码服务当前不可用，配置未保存（避免保存后无法登录）');
  }
}

const router = new Router();

router.post('/batch', jwtAuth(), hasPerm('system:config:edit'), async (ctx: Context) => {
  const tid = getCurrentTenantId();
  if (!tid) throw new ValidationError('缺少租户上下文');

  const parsed = batchSchema.safeParse(ctx.request.body ?? {});
  if (!parsed.success) throw new ValidationError('参数格式不正确');
  const items = parsed.data.items;
  assertManagedKeys(items);

  const db = (await getDb()) as any;

  // 现有生效值（用于合并校验）
  const rows = await db.selectFrom('sys_config')
    .select(['config_key', 'config_value'])
    .where('tenant_id', '=', tid)
    .where('deleted', '=', 0)
    .execute();
  const existing: Record<string, string> = {};
  for (const r of rows as any[]) existing[String(r.config_key ?? '')] = String(r.config_value ?? '');

  await assertEffectiveCaptchaUsable(existing, items);

  // 单事务内全部更新；缺失行则插入（新租户首次配置）
  try {
    await db.transaction().execute(async (trx: any) => {
      for (const item of items) {
        const updated = await trx.updateTable('sys_config')
          .set({
            config_value: item.configValue,
            ...(item.configName !== undefined ? { config_name: item.configName } : {}),
            ...(item.configType !== undefined ? { config_type: item.configType } : {}),
            ...(item.remark !== undefined ? { remark: item.remark } : {}),
            update_time: new Date(),
          })
          .where('tenant_id', '=', tid)
          .where('config_key', '=', item.configKey)
          .where('deleted', '=', 0)
          .executeTakeFirst();

        const changed = Number((updated as any)?.numUpdatedRows ?? (updated as any)?.affectedRows ?? 0);
        if (changed > 0) continue;

        await trx.insertInto('sys_config').values({
          config_id: generateSnowflakeId(),
          tenant_id: tid,
          config_key: item.configKey,
          config_value: item.configValue,
          config_name: item.configName ?? item.configKey,
          config_type: item.configType ?? 'sys',
          status: '0',
          remark: item.remark ?? null,
          deleted: 0,
          create_time: new Date(),
          update_time: new Date(),
        }).execute();
      }
    });
  } catch (err) {
    logger.error('[config] batch update failed', { error: String(err) });
    throw new ValidationError('配置保存失败，已回滚，请重试');
  }

  // 立即生效
  await invalidateConfigCache(tid);

  ctx.body = { code: 200, data: { updated: items.length }, message: '保存成功' };
});

export default router;
