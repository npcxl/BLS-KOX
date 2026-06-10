import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
import { success } from '../../../core/response';
import { MenuService } from './menu.service';

const menuSchema = z.object({
  parentId: z.coerce.number().int().min(0),
  menuName: z.string().min(1),
  path: z.string().optional(),
  component: z.string().optional(),
  perms: z.string().optional(),
  menuType: z.enum(['0', '1', '2']),
  sortNum: z.coerce.number().optional(),
  status: z.enum(['0', '1']).optional(),
});
const editMenuSchema = menuSchema.extend({ menuId: z.coerce.number().int().positive() });

function toIds(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === 'string') return value.split(',').map(Number).filter(Number.isFinite);
  if (typeof value === 'number') return [value];
  return [];
}

export class MenuController {
  constructor(private readonly service = new MenuService()) {}

  list = async (ctx: Context) => {
    success(ctx, await this.service.list(), '查询成功');
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
    await this.service.remove(toIds(ctx.query.ids ?? ctx.request.body?.ids));
    success(ctx, null, '删除成功');
  };
}
