import { Context } from "koa";
import { z } from "zod";
import { ValidationError } from "../../../core/errors";
import { getAuditActor, writeOperationLog } from "../../../core/audit";
import { getCurrentTenantId } from "../../../middleware/tenant";
import { pageSuccess, success } from "../../../core/response";
import { PackageService } from "./package.service";

const packageSchema = z.object({
  packageId: z.string().min(1).optional(),
  packageName: z.string().min(1, "套餐名称不能为空"),
  status: z.enum(["0", "1"]).optional(),
  remark: z.string().nullable().optional(),
  menuIds: z.array(z.string()).nullable().optional(),
});
const editPackageSchema = packageSchema.extend({
  packageId: z.string().min(1),
});
const assignMenuSchema = z.object({ menuIds: z.array(z.string()).default([]) });

function toIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string")
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  if (typeof value === "number") return [String(value)];
  return [];
}

export class PackageController {
  constructor(private readonly service = new PackageService()) {}

  list = async (ctx: Context): Promise<void> => {
    const result = await this.service.list(ctx.query);
    pageSuccess(ctx, result.rows, result.total);
  };

  options = async (ctx: Context): Promise<void> => {
    success(ctx, await this.service.options(), "查询成功");
  };

  detail = async (ctx: Context): Promise<void> => {
    success(
      ctx,
      await this.service.detail(String(ctx.params.packageId)),
      "查询成功",
    );
  };

  add = async (ctx: Context): Promise<void> => {
    const parsed = packageSchema.safeParse(ctx.request.body);
    if (!parsed.success)
      throw new ValidationError("参数错误", parsed.error.flatten());
    const packageId = await this.service.add(parsed.data);
    await writeOperationLog({
      actor: getAuditActor(ctx, getCurrentTenantId()),
      moduleName: "package",
      businessType: "ADD",
      title: "新增套餐",
      requestMethod: ctx.method,
      requestUrl: ctx.path,
      requestParams: JSON.stringify(parsed.data),
      responseStatus: 200,
      success: "1",
    }).catch(() => undefined);
    success(ctx, { packageId }, "新增成功");
  };

  edit = async (ctx: Context): Promise<void> => {
    const parsed = editPackageSchema.safeParse(ctx.request.body);
    if (!parsed.success)
      throw new ValidationError("参数错误", parsed.error.flatten());
    await this.service.edit(parsed.data);
    await writeOperationLog({
      actor: getAuditActor(ctx, getCurrentTenantId()),
      moduleName: "package",
      businessType: "UPDATE",
      title: "修改套餐",
      requestMethod: ctx.method,
      requestUrl: ctx.path,
      requestParams: JSON.stringify(parsed.data),
      responseStatus: 200,
      success: "1",
    }).catch(() => undefined);
    success(ctx, null, "修改成功");
  };

  remove = async (ctx: Context): Promise<void> => {
    const bodyIds = (ctx.request.body as { ids?: unknown } | undefined)?.ids;
    await this.service.remove(toIds(ctx.query.ids ?? bodyIds));
    await writeOperationLog({
      actor: getAuditActor(ctx, getCurrentTenantId()),
      moduleName: "package",
      businessType: "DELETE",
      title: "删除套餐",
      requestMethod: ctx.method,
      requestUrl: ctx.path,
      requestParams: JSON.stringify({ ids: ctx.query.ids ?? bodyIds }),
      responseStatus: 200,
      success: "1",
    }).catch(() => undefined);
    success(ctx, null, "删除成功");
  };

  menuIds = async (ctx: Context): Promise<void> => {
    success(
      ctx,
      await this.service.menuIds(String(ctx.params.packageId)),
      "查询成功",
    );
  };

  assignMenus = async (ctx: Context): Promise<void> => {
    const parsed = assignMenuSchema.safeParse(ctx.request.body);
    if (!parsed.success)
      throw new ValidationError("参数错误", parsed.error.flatten());
    await this.service.assignMenus(
      String(ctx.params.packageId),
      parsed.data.menuIds,
    );
    await writeOperationLog({
      actor: getAuditActor(ctx, getCurrentTenantId()),
      moduleName: "package",
      businessType: "ASSIGN_MENUS",
      title: "分配菜单",
      requestMethod: ctx.method,
      requestUrl: ctx.path,
      requestParams: JSON.stringify({
        packageId: ctx.params.packageId,
        menuIds: parsed.data.menuIds,
      }),
      responseStatus: 200,
      success: "1",
    }).catch(() => undefined);
    success(ctx, null, "分配成功");
  };
}
