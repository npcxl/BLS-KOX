import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../core/errors';
import { success } from '../../core/response';
import { AuthService } from './auth.service';

const loginSchema = z.object({
  username: z.string().min(1, '用户名不能为空'),
  password: z.string().min(1, '密码不能为空'),
  tenantId: z.coerce.number().int().min(0).optional(),
});

export class AuthController {
  constructor(private readonly service = new AuthService()) {}

  login = async (ctx: Context): Promise<void> => {
    const parsed = loginSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());

    ctx.body = await this.service.login(parsed.data.username, parsed.data.password, parsed.data.tenantId);
  };

  profile = async (ctx: Context): Promise<void> => {
    const user = ctx.state.user;
    if (!user) return;
    success(ctx, user, '查询成功');
  };
}
