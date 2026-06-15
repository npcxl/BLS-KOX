import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
import { success } from '../../../core/response';
import { MenuService } from './menu.service';

const menuSchema = z.object({
  parentId: z.string().min(1),
  menuName: z.string().min(1),
  icon: z.string().nullable().optional(),
  path: z.string().nullable().optional(),
  component: z.string().nullable().optional(),
  perms: z.string().nullable().optional(),
  menuType: z.enum(['0', '1', '2']),
  sortNum: z.coerce.number().optional(),
  status: z.enum(['0', '1']).optional(),
});
const editMenuSchema = menuSchema.extend({ menuId: z.string().min(1) });

function toIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'number') return [String(value)];
  return [];
}

export class MenuController {
  constructor(private readonly service = new MenuService()) {}

  list = async (ctx: Context) => {
    success(ctx, await this.service.list(), '查询成功');
  };

  packageTree = async (ctx: Context) => {
    success(ctx, await this.service.packageTree(ctx.state.user.tenantId), '查询成功');
  };

  add = async (ctx: Context) => {
    const parsed = menuSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    const menuId = await this.service.add(parsed.data);
    success(ctx, { menuId }, '新增成功');
  };

  edit = async (ctx: Context) => {
    const parsed = editMenuSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.edit(parsed.data);
    success(ctx, null, '修改成功');
  };

  remove = async (ctx: Context) => {
    const bodyIds = (ctx.request.body as { ids?: unknown } | undefined)?.ids;
    await this.service.remove(toIds(ctx.query.ids ?? bodyIds));
    success(ctx, null, '删除成功');
  };
}
