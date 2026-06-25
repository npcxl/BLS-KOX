import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
import { pageSuccess, success } from '../../../core/response';
import { DownloadService } from './download.service';

const querySchema = z.object({
  pageNum: z.union([z.string(), z.number()]).optional(),
  pageSize: z.union([z.string(), z.number()]).optional(),
  keyword: z.string().optional(),
});

const downloadSchema = z.object({
  fileName: z.string().min(1),
  fileFormat: z.string().min(1),
  fileSize: z.union([z.string(), z.number()]).optional(),
  fileUrl: z.string().min(1),
  uploadTime: z.union([z.string(), z.null()]).optional(),
});

const editSchema = downloadSchema.extend({ id: z.string().min(1) });
const removeSchema = z.object({ ids: z.union([z.array(z.string()), z.string()]) });

function toIds(value: string[] | string) {
  return Array.isArray(value) ? value : value.split(',').map((item) => item.trim()).filter(Boolean);
}

export class DownloadController {
  constructor(private readonly service = new DownloadService()) {}

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
    const parsed = downloadSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    const id = await this.service.add({
      ...parsed.data,
      fileSize: parsed.data.fileSize == null ? 0 : Number(parsed.data.fileSize),
    });
    success(ctx, { id }, '新增成功');
  };

  edit = async (ctx: Context) => {
    const parsed = editSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.edit(parsed.data.id, {
      ...parsed.data,
      fileSize: parsed.data.fileSize == null ? 0 : Number(parsed.data.fileSize),
    });
    success(ctx, null, '修改成功');
  };

  remove = async (ctx: Context) => {
    const parsed = removeSchema.safeParse({ ids: (ctx.query as any)?.ids ?? (ctx.request.body as any)?.ids });
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await this.service.remove(toIds(parsed.data.ids));
    success(ctx, null, '删除成功');
  };
}
