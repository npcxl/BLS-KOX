import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
import { pageSuccess, success } from '../../../core/response';
import { UserService } from './user.service';

const userSchema = z.object({
  username: z.string().min(1),
  nickname: z.string().min(1),
  password: z.string().optional(),
  tenantId: z.coerce.number().optional(),
  isAdmin: z.enum(['0', '1']).optional(),
  status: z.enum(['0', '1']).optional(),
  remark: z.string().optional(),
  roleIds: z.array(z.coerce.number()).optional(),
});
const editUserSchema = userSchema.extend({ userId: z.coerce.number().int().positive() });
const idsSchema = z.object({ ids: z.union([z.array(z.coerce.number()), z.string(), z.number()]) });

function toIds(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === 'string') return value.split(',').map(Number).filter(Number.isFinite);
  if (typeof value === 'number') return [value];
  return [];
}

export class UserController {
  constructor(private readonly service = new UserService()) {}

  list = async (ctx: Context) => {
    const result = await this.service.list(ctx.query);
    pageSuccess(ctx, result.rows, result.total);
  };

  add = async (ctx: Context) => {
    const parsed = userSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    const userId = await this.service.add(parsed.data);
    success(ctx, { userId }, '新增成功');
  };

  edit = async (ctx: Context) => {
    const parsed = editUserSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.edit(parsed.data);
    success(ctx, null, '修改成功');
  };

  remove = async (ctx: Context) => {
    const parsed = idsSchema.safeParse({ ids: ctx.query.ids ?? ctx.request.body?.ids });
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.remove(toIds(parsed.data.ids));
    success(ctx, null, '删除成功');
  };
}
