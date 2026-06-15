import { Context } from "koa";
import { z } from "zod";
import { ValidationError } from "../../../core/errors";
import { pageSuccess, success } from "../../../core/response";
import { ThemeService } from "./theme.service";

const boolNumber = z
  .union([z.boolean(), z.number(), z.string()])
  .transform((value) => {
    if (value === true || value === 1 || value === "1" || value === "true") {
      return 1;
    }

    if (value === false || value === 0 || value === "0" || value === "false") {
      return 0;
    }

    return 0;
  });

const themeSchema = z.object({
  themeId: z.string().min(1).optional(),
  navTheme: z.enum(["light", "dark", "realDark"]).optional(),
  colorPrimary: z.string().optional(),
  layout: z.enum(["side", "top", "mix"]).optional(),
  contentWidth: z.enum(["Fluid", "Fixed"]).optional(),
  fixedHeader: boolNumber.optional(),
  fixSiderbar: boolNumber.optional(),
  colorWeak: boolNumber.optional(),
  title: z.string().min(1),
  logo: z.string().nullable().optional(),
  iconfontUrl: z.string().nullable().optional(),
  tokenJson: z.string().nullable().optional(),
  status: z.enum(["0", "1"]).optional(),
  remark: z.string().nullable().optional(),
});
const editThemeSchema = themeSchema.extend({ themeId: z.string().min(1) });

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

export class ThemeController {
  constructor(private readonly service = new ThemeService()) {}

  list = async (ctx: Context): Promise<void> => {
    const result = await this.service.list(ctx.query);
    pageSuccess(ctx, result.rows, result.total);
  };

  current = async (ctx: Context): Promise<void> => {
    success(ctx, await this.service.current(), "查询成功");
  };

  add = async (ctx: Context): Promise<void> => {
    const parsed = themeSchema.safeParse(ctx.request.body);
    if (!parsed.success)
      throw new ValidationError("参数错误", parsed.error.issues);
    success(ctx, { themeId: await this.service.add(parsed.data) }, "新增成功");
  };

  edit = async (ctx: Context): Promise<void> => {
    const parsed = editThemeSchema.safeParse(ctx.request.body);
    if (!parsed.success)
      throw new ValidationError("参数错误", parsed.error.issues);
    await this.service.edit(parsed.data);
    success(ctx, null, "修改成功");
  };

  remove = async (ctx: Context): Promise<void> => {
    const bodyIds = (ctx.request.body as { ids?: unknown } | undefined)?.ids;
    await this.service.remove(toIds(ctx.query.ids ?? bodyIds));
    success(ctx, null, "删除成功");
  };
}
