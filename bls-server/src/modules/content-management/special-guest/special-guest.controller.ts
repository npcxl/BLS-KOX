import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
import { pageSuccess, success } from '../../../core/response';
import { SpecialGuestService } from './special-guest.service';

const querySchema = z.object({
  pageNum: z.union([z.string(), z.number()]).optional(),
  pageSize: z.union([z.string(), z.number()]).optional(),
  keyword: z.string().optional(),
});

const guestSchema = z.object({
  name: z.string().min(1),
  title: z.union([z.string(), z.null()]).optional(),
  sortNo: z.union([z.string(), z.number()]).optional(),
  avatar: z.union([z.string(), z.null()]).optional(),
  description: z.union([z.string(), z.null()]).optional(),
  status: z.union([z.string(), z.number()]).optional(),
});

const editSchema = guestSchema.extend({ id: z.string().min(1) });
const removeSchema = z.object({ ids: z.union([z.array(z.string()), z.string()]) });

function toIds(value: string[] | string) {
  return Array.isArray(value) ? value : value.split(',').map((item) => item.trim()).filter(Boolean);
}

export class SpecialGuestController {
  constructor(private readonly service = new SpecialGuestService()) {}

  list = async (ctx: Context) => {
    const parsed = querySchema.safeParse(ctx.query);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    const pageNum = Number(parsed.data.pageNum ?? 1);
    const pageSize = Number(parsed.data.pageSize ?? 10);
    const result = await this.service.list(pageNum, pageSize, parsed.data.keyword);
    pageSuccess(ctx, result.rows, result.total);
  };

  detail = async (ctx: Context) => {
    const id = String(ctx.params.id ?? '');
    if (!id) throw new ValidationError('参数错误');
    const result = await this.service.detail(id);
    success(ctx, result, '查询成功');
  };

  add = async (ctx: Context) => {
    const parsed = guestSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    const id = await this.service.add({
      ...parsed.data,
      sortNo: parsed.data.sortNo == null ? 0 : Number(parsed.data.sortNo),
      status: parsed.data.status == null ? 0 : Number(parsed.data.status),
    });
    success(ctx, { id }, '新增成功');
  };

  edit = async (ctx: Context) => {
    const parsed = editSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.edit(parsed.data.id, {
      ...parsed.data,
      sortNo: parsed.data.sortNo == null ? 0 : Number(parsed.data.sortNo),
      status: parsed.data.status == null ? 0 : Number(parsed.data.status),
    });
    success(ctx, null, '修改成功');
  };

  status = async (ctx: Context) => {
    const schema = z.object({ id: z.string().min(1), status: z.union([z.string(), z.number()]) });
    const parsed = schema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.updateStatus(parsed.data.id, Number(parsed.data.status));
    success(ctx, null, '状态修改成功');
  };

  remove = async (ctx: Context) => {
    const parsed = removeSchema.safeParse({ ids: (ctx.query as any)?.ids ?? (ctx.request.body as any)?.ids });
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.remove(toIds(parsed.data.ids));
    success(ctx, null, '删除成功');
  };
}
