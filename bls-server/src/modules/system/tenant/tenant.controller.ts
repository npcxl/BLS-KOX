import { Context } from 'koa';
import { z } from 'zod';
import { pageSuccess, success } from '../../../core/response';
import { ValidationError } from '../../../core/errors';
import { TenantService } from './tenant.service';

const tenantSchema = z.object({
  tenantName: z.string().min(1, '租户名称不能为空'),
  contactUser: z.string().optional(),
  contactPhone: z.string().optional(),
  status: z.enum(['0', '1']).optional(),
  remark: z.string().optional(),
});

const editTenantSchema = tenantSchema.extend({ tenantId: z.coerce.number().int().min(0) });
const statusSchema = z.object({ tenantId: z.coerce.number().int().min(0), status: z.enum(['0', '1']) });

function parseIds(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === 'string') return value.split(',').map(Number).filter(Number.isFinite);
  if (typeof value === 'number') return [value];
  return [];
}

export class TenantController {
  constructor(private readonly service = new TenantService()) {}

  publicList = async (ctx: Context): Promise<void> => {
    success(ctx, await this.service.listPublic(), '查询成功');
  };

  list = async (ctx: Context): Promise<void> => {
    const result = await this.service.list(ctx.query);
    pageSuccess(ctx, result.rows, result.total);
  };

  add = async (ctx: Context): Promise<void> => {
    const parsed = tenantSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    const tenantId = await this.service.add(parsed.data);
    success(ctx, { tenantId }, '新增成功');
  };

  edit = async (ctx: Context): Promise<void> => {
    const parsed = editTenantSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.edit(parsed.data);
    success(ctx, null, '修改成功');
  };

  remove = async (ctx: Context): Promise<void> => {
    await this.service.remove(parseIds(ctx.query.ids ?? ctx.request.body?.ids));
    success(ctx, null, '删除成功');
  };

  status = async (ctx: Context): Promise<void> => {
    const parsed = statusSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.changeStatus(parsed.data.tenantId, parsed.data.status);
    success(ctx, null, '状态修改成功');
  };
}
