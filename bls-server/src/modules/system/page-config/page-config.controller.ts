import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
import { success } from '../../../core/response';
import { pageConfigRepository } from './page-config.repository';

const pageConfigSchema = z.object({
  pageId: z.string().min(1).optional(),
  pageCode: z.string().min(1),
  pageName: z.string().min(1),
  enabled: z.enum(['0', '1']).default('1'),
  sort: z.number().int().optional(),
  remark: z.string().nullable().optional(),
});

const pageColumnSchema = z.object({
  columnId: z.string().min(1),
  dataIndex: z.string().min(1),
  title: z.string().min(1),
  orderNum: z.number().int(),
  visible: z.enum(['0', '1']),
  searchable: z.enum(['0', '1']),
  editable: z.enum(['0', '1']),
  ellipsis: z.enum(['0', '1']).optional(),
  formType: z.string().nullable().optional(),
  valueEnumCode: z.string().nullable().optional(),
  placeholder: z.string().nullable().optional(),
  required: z.enum(['0', '1']).optional(),
});

const saveSchema = z.object({
  page: pageConfigSchema,
  columns: z.array(pageColumnSchema),
});

export class PageConfigController {
  list = async (ctx: Context): Promise<void> => {
    success(ctx, await pageConfigRepository.listPages(), '查询成功');
  };

  detail = async (ctx: Context): Promise<void> => {
    success(ctx, await pageConfigRepository.getPageByCode(String(ctx.params.pageCode)), '查询成功');
  };

  columns = async (ctx: Context): Promise<void> => {
    success(ctx, await pageConfigRepository.getColumnsByPageCode(String(ctx.params.pageCode)), '查询成功');
  };

  save = async (ctx: Context): Promise<void> => {
    const parsed = saveSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    await pageConfigRepository.savePageWithColumns(parsed.data.page, parsed.data.columns as any);
    success(ctx, null, '保存成功');
  };
}
