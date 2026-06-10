import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
import { pageSuccess, success } from '../../../core/response';
import { RoleService } from './role.service';

const roleSchema = z.object({
  roleName: z.string().min(1),
  roleKey: z.string().min(1),
  sortNum: z.coerce.number().optional(),
  status: z.enum(['0', '1']).optional(),
  remark: z.string().optional(),
  menuIds: z.array(z.coerce.number()).optional(),
});
const editRoleSchema = roleSchema.extend({ roleId: z.coerce.number().int().positive() });

function toIds(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === 'string') return value.split(',').map(Number).filter(Number.isFinite);
  if (typeof value === 'number') return [value];
  return [];
}

export class RoleController {
  constructor(private readonly service = new RoleService()) {}

  list = async (ctx: Context) => {
    const result = await this.service.list(ctx.query);
    pageSuccess(ctx, result.rows, result.total);
  };

  add = async (ctx: Context) => {
    const parsed = roleSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    const roleId = await this.service.add(parsed.data);
    success(ctx, { roleId }, '新增成功');
  };

  edit = async (ctx: Context) => {
    const parsed = editRoleSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.edit(parsed.data);
    success(ctx, null, '修改成功');
  };

  remove = async (ctx: Context) => {
    await this.service.remove(toIds(ctx.query.ids ?? ctx.request.body?.ids));
    success(ctx, null, '删除成功');
  };
}
