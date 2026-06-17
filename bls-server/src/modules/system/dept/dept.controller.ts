import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
import { getAuditActor, writeOperationLog } from '../../../core/audit';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { pageSuccess, success } from '../../../core/response';
import { DeptService } from './dept.service';

const deptSchema = z.object({
  deptId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
  deptName: z.string().min(1, '部门名称不能为空'),
  sortNum: z.coerce.number().int().optional(),
  status: z.enum(['0', '1']).optional(),
});
const editDeptSchema = deptSchema.extend({ deptId: z.string().min(1) });
const idsSchema = z.object({ ids: z.union([z.array(z.string()), z.string(), z.number()]) });

function toIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'number') return [String(value)];
  return [];
}

export class DeptController {
  constructor(private readonly service = new DeptService()) {}

  list = async (ctx: Context): Promise<void> => {
    const rows = await this.service.list(ctx.query);
    success(ctx, rows);
  };

  add = async (ctx: Context): Promise<void> => {
    const parsed = deptSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    const deptId = await this.service.add(parsed.data);
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: 'dept', businessType: 'ADD', title: '新增部门', requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify(parsed.data), responseStatus: 200, success: '1' }).catch(() => undefined);
    success(ctx, { deptId }, '新增成功');
  };

  edit = async (ctx: Context): Promise<void> => {
    const parsed = editDeptSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.edit(parsed.data);
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: 'dept', businessType: 'UPDATE', title: '修改部门', requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify(parsed.data), responseStatus: 200, success: '1' }).catch(() => undefined);
    success(ctx, null, '修改成功');
  };

  remove = async (ctx: Context): Promise<void> => {
    const parsed = idsSchema.safeParse({ ids: ctx.query.ids ?? ctx.request.body?.ids });
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.remove(toIds(parsed.data.ids));
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: 'dept', businessType: 'DELETE', title: '删除部门', requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify({ ids: parsed.data.ids }), responseStatus: 200, success: '1' }).catch(() => undefined);
    success(ctx, null, '删除成功');
  };
}
