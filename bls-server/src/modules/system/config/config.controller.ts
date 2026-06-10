import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
import { pageSuccess, success } from '../../../core/response';
import { ConfigService } from './config.service';

const configSchema = z.object({
  configKey: z.string().min(1),
  configValue: z.string().min(1),
  configName: z.string().min(1),
  configType: z.enum(['sys', 'theme', 'dict']),
  tenantId: z.coerce.number().int().min(0).optional(),
  remark: z.string().optional(),
  status: z.enum(['0', '1']).optional(),
});

const editConfigSchema = configSchema.extend({ configId: z.coerce.number().int().min(1) });

export class ConfigController {
  constructor(private readonly service = new ConfigService()) {}

  list = async (ctx: Context): Promise<void> => {
    const result = await this.service.list(ctx.query);
    pageSuccess(ctx, result.rows, result.total);
  };

  detail = async (ctx: Context): Promise<void> => {
    const configId = z.coerce.number().int().min(1).parse(ctx.params.configId);
    success(ctx, await this.service.detail(configId), '查询成功');
  };

  add = async (ctx: Context): Promise<void> => {
    const parsed = configSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    success(ctx, { configId: await this.service.add(parsed.data) }, '新增成功');
  };

  edit = async (ctx: Context): Promise<void> => {
    const parsed = editConfigSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.edit(parsed.data);
    success(ctx, null, '修改成功');
  };
}
