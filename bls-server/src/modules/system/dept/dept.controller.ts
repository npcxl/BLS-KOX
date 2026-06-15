import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
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
    success(ctx, { deptId }, '新增成功');
  };

  edit = async (ctx: Context): Promise<void> => {
    const parsed = editDeptSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.edit(parsed.data);
    success(ctx, null, '修改成功');
  };

  remove = async (ctx: Context): Promise<void> => {
    const parsed = idsSchema.safeParse({ ids: ctx.query.ids ?? ctx.request.body?.ids });
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.remove(toIds(parsed.data.ids));
    success(ctx, null, '删除成功');
  };
}
