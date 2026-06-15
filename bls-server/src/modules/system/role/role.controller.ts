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
  remark: z.string().nullable().optional(),
  menuIds: z.array(z.string()).nullable().optional(),
});
const editRoleSchema = roleSchema.extend({ roleId: z.string().min(1) });
const assignMenuSchema = z.object({ menuIds: z.array(z.string()).default([]) });

function toIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'number') return [String(value)];
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
    await this.service.edit(parsed.data as any);
    success(ctx, null, '修改成功');
  };

  remove = async (ctx: Context) => {
    await this.service.remove(toIds(ctx.query.ids ?? ctx.request.body?.ids));
    success(ctx, null, '删除成功');
  };

  menuIds = async (ctx: Context) => {
    success(ctx, await this.service.menuIds(String(ctx.params.roleId)), '查询成功');
  };

  assignMenus = async (ctx: Context) => {
    const parsed = assignMenuSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.assignMenus(String(ctx.params.roleId), parsed.data.menuIds);
    success(ctx, null, '分配成功');
  };
}
