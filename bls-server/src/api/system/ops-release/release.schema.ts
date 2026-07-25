import { z } from 'zod';
import { SERVICE_ALLOWLIST, ENVIRONMENT_ALLOWLIST } from './release.constants';

/** 语义化版本校验 */
const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** 创建发布任务 Schema */
export const createReleaseSchema = z.object({
  environment: z.enum(ENVIRONMENT_ALLOWLIST, {
    message: `environment 必须是 ${ENVIRONMENT_ALLOWLIST.join(' / ')}`,
  }),
  version: z.string()
    .min(1, 'version 不能为空')
    .regex(semverRegex, 'version 必须是合法语义化版本 (x.y.z)'),
  services: z.array(
    z.enum(SERVICE_ALLOWLIST as any, {
      message: `services 包含非法值，白名单: ${SERVICE_ALLOWLIST.join(', ')}`,
    }),
  ).min(1, '至少选择一个服务'),
  reason: z.string()
    .min(1, 'reason 不能为空')
    .max(500, 'reason 不能超过 500 字符'),
});

export type CreateReleaseInput = z.infer<typeof createReleaseSchema>;

/** 回调请求 Schema */
export const releaseCallbackSchema = z.object({
  taskId: z.string().min(1),
  stage: z.string().min(1),
  status: z.enum(['waiting', 'running', 'success', 'failed', 'skipped', 'rollback', 'cancelled']),
  progress: z.number().min(0).max(100),
  message: z.string(),
  timestamp: z.string(),
});

export type ReleaseCallbackInput = z.infer<typeof releaseCallbackSchema>;
