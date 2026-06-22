import { Context } from "koa";
import { z } from "zod";
import { env } from "../../config/env";
import { ValidationError } from "../../core/errors";
import { success } from "../../core/response";
import { getAuditActor, writeOperationLog } from "../../core/audit";
import { AuthService } from "./auth.service";
import { buildRequestMeta } from "../../shared/utils/request-meta";

const loginSchema = z.object({
  username: z.string().min(1, "用户名不能为空"),
  password: z.string().min(1, "密码不能为空"),
  tenantId: z.string().min(1).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken 不能为空"),
});

export class AuthController {
  constructor(private readonly service = new AuthService()) {}

  login = async (ctx: Context): Promise<void> => {
    const parsed = loginSchema.safeParse(ctx.request.body);
    if (!parsed.success)
      throw new ValidationError("参数错误", parsed.error.issues);

    const domainName = (ctx.hostname || ctx.host.split(":")[0]).toLowerCase();
    const isLocalDev =
      env.nodeEnv === "development" &&
      ["localhost", "127.0.0.1"].includes(domainName);
    const loginMeta = await buildRequestMeta(ctx, "password");
    const result =
      isLocalDev && parsed.data.tenantId
        ? await this.service.login(
            parsed.data.tenantId,
            parsed.data.username,
            parsed.data.password,
            loginMeta,
          )
        : await this.service.loginByDomain(
            domainName,
            parsed.data.username,
            parsed.data.password,
            loginMeta,
          );
    await writeOperationLog({
      actor: getAuditActor(ctx, result.user.tenantId),
      userId: result.user.userId,
      username: result.user.username,
      moduleName: "auth",
      businessType: "LOGIN",
      title: "用户登录",
      requestMethod: ctx.method,
      requestUrl: ctx.path,
      responseStatus: 200,
      success: "1",
    }).catch(() => undefined);
    success(ctx, result, "登录成功");
  };

  refresh = async (ctx: Context): Promise<void> => {
    const parsed = refreshSchema.safeParse(ctx.request.body);
    if (!parsed.success)
      throw new ValidationError("参数错误", parsed.error.issues);
    success(
      ctx,
      await this.service.refresh(parsed.data.refreshToken),
      "刷新成功",
    );
  };

  profile = async (ctx: Context): Promise<void> => {
    const user = ctx.state.user;
    if (!user) return;
    success(ctx, user, "查询成功");
  };

  logout = async (ctx: Context): Promise<void> => {
    const authHeader = ctx.headers.authorization;
    const rawToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;
    const refreshToken = (
      ctx.request.body as { refreshToken?: string } | undefined
    )?.refreshToken;
    if (rawToken) await this.service.logout(rawToken, refreshToken);
    const user = ctx.state.user;
    await writeOperationLog({
      actor: getAuditActor(ctx, user?.tenantId ?? "000000"),
      moduleName: "auth",
      businessType: "LOGOUT",
      title: "用户退出",
      requestMethod: ctx.method,
      requestUrl: ctx.path,
      responseStatus: 200,
      success: "1",
    }).catch(() => undefined);
    success(ctx, null, "退出成功");
  };
}
