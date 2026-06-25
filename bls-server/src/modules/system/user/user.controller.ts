import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
import { pageSuccess, success } from '../../../core/response';
import { getAuditActor, writeOperationLog } from '../../../core/audit';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { UserService } from './user.service';

const userSchema = z.object({
  username: z.string().min(1).optional(),
  nickname: z.string().min(1).optional(),
  realName: z.union([z.string(), z.null()]).optional(),
  avatar: z.union([z.string(), z.null()]).optional(),
  gender: z.enum(['0', '1', '2']).optional(),
  email: z.union([z.string(), z.null()]).optional(),
  phone: z.union([z.string(), z.null()]).optional(),
  password: z.string().nullable().optional(),
  deptId: z.union([z.string(), z.null()]).optional(),
  isAdmin: z.enum(['0', '1']).optional(),
  status: z.enum(['0', '1']).optional(),
  remark: z.union([z.string(), z.null()]).optional(),
  roleIds: z.union([z.array(z.string()), z.string(), z.null()]).optional(),
});
const editUserSchema = userSchema.extend({ userId: z.string().min(1) });
const idsSchema = z.object({ ids: z.union([z.array(z.string()), z.string(), z.number()]) });

function toIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'number') return [String(value)];
  return [];
}

export class UserController {
  constructor(private readonly service = new UserService()) {}

  list = async (ctx: Context) => {
    const result = await this.service.list(ctx.query);
    pageSuccess(ctx, result.rows, result.total);
  };

  profile = async (ctx: Context) => {
    const user = ctx.state.user;
    if (!user) throw new ValidationError('未登录或登录已过期');
    const result = await this.service.getProfile(String(user.userId));
    success(ctx, result, '查询成功');
  };

  updateProfile = async (ctx: Context) => {
    const user = ctx.state.user;
    if (!user) throw new ValidationError('未登录或登录已过期');
    const parsed = userSchema.partial().safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());

    const payload = parsed.data as any;
    const updateData = {
      nickname: payload.nickname ?? user.nickname,
      realName: payload.realName ?? user.realName,
      gender: payload.gender ?? user.gender,
      email: payload.email ?? user.email,
      phone: payload.phone ?? user.phone,
      avatar: payload.avatar ?? user.avatar,
      remark: payload.remark ?? user.remark,
    };

    await this.service.updateProfile(String(user.userId), updateData);
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: 'user', businessType: 'UPDATE', title: '修改个人资料', requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify(updateData), responseStatus: 200, success: '1' }).catch(() => undefined);
    success(ctx, null, '修改成功');
  };

  add = async (ctx: Context) => {
    const parsed = userSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    const userId = await this.service.add(parsed.data as any);
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: 'user', businessType: 'ADD', title: '新增用户', requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify(parsed.data), responseStatus: 200, success: '1' }).catch(() => undefined);
    success(ctx, { userId }, '新增成功');
  };

  edit = async (ctx: Context) => {
    const parsed = editUserSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.edit(parsed.data as any);
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: 'user', businessType: 'UPDATE', title: '修改用户', requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify(parsed.data), responseStatus: 200, success: '1' }).catch(() => undefined);
    success(ctx, null, '修改成功');
  };

  remove = async (ctx: Context) => {
    const parsed = idsSchema.safeParse({ ids: (ctx.query as any)?.ids ?? (ctx.request.body as any)?.ids });
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.remove(toIds(parsed.data.ids));
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: 'user', businessType: 'DELETE', title: '删除用户', requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify({ ids: parsed.data.ids }), responseStatus: 200, success: '1' }).catch(() => undefined);
    success(ctx, null, '删除成功');
  };
}
