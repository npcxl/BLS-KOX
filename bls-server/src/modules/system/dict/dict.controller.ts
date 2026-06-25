import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
import { getAuditActor, writeOperationLog } from '../../../core/audit';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { pageSuccess, success } from '../../../core/response';
import { DictService } from './dict.service';

const dictTypeSchema = z.object({
  dictTypeId: z.string().min(1).optional(),
  dictName: z.string().min(1),
  dictType: z.string().min(1),
  status: z.enum(['0', '1']).optional(),
  remark: z.string().optional(),
});
const editDictTypeSchema = dictTypeSchema.extend({ dictTypeId: z.string().min(1) });

const dictDataSchema = z.object({
  dictDataId: z.string().min(1).optional(),
  dictTypeId: z.string().min(1),
  dictLabel: z.string().min(1),
  dictValue: z.string().min(1),
  dictSort: z.coerce.number().optional(),
  status: z.enum(['0', '1']).optional(),
  remark: z.string().nullable().optional(),
});
const editDictDataSchema = dictDataSchema.extend({ dictDataId: z.string().min(1) });

function toIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'number') return [String(value)];
  return [];
}

export class DictController {
  constructor(private readonly service = new DictService()) {}

  listTypes = async (ctx: Context): Promise<void> => {
    const result = await this.service.listTypes(ctx.query);
    pageSuccess(ctx, result.rows, result.total);
  };

  addType = async (ctx: Context): Promise<void> => {
    const parsed = dictTypeSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.issues);
    const dictTypeId = await this.service.addType(parsed.data);
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: 'dict', businessType: 'ADD', title: '新增字典类型', requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify(parsed.data), responseStatus: 200, success: '1' }).catch(() => undefined);
    success(ctx, { dictTypeId }, '新增成功');
  };

  editType = async (ctx: Context): Promise<void> => {
    const parsed = editDictTypeSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.issues);
    await this.service.editType(parsed.data);
    await writeOperationLog({ actor: getAuditActor(ctx, getCurrentTenantId()), moduleName: 'dict', businessType: 'UPDATE', title: '修改字典类型', requestMethod: ctx.method, requestUrl: ctx.path, requestParams: JSON.stringify(parsed.data), responseStatus: 200, success: '1' }).catch(() => undefined);
    success(ctx, null, '修改成功');
  };

  removeTypes = async (ctx: Context): Promise<void> => {
    await this.service.removeTypes(toIds(ctx.query.ids ?? (ctx.request.body as any)?.ids));
    success(ctx, null, '删除成功');
  };

  listDataByType = async (ctx: Context): Promise<void> => {
    const dictType = ctx.query.dictType as string;
    if (!dictType) throw new ValidationError('dictType 不能为空');
    const data = await this.service.listDataByType(dictType);
    success(ctx, data);
  };

  listData = async (ctx: Context): Promise<void> => {
    const result = await this.service.listData(ctx.query);
    pageSuccess(ctx, result.rows, result.total);
  };

  addData = async (ctx: Context): Promise<void> => {
    const parsed = dictDataSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.issues);
    success(ctx, { dictDataId: await this.service.addData(parsed.data) }, '新增成功');
  };

  editData = async (ctx: Context): Promise<void> => {
    const parsed = editDictDataSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.issues);
    await this.service.editData(parsed.data);
    success(ctx, null, '修改成功');
  };

  removeData = async (ctx: Context): Promise<void> => {
    await this.service.removeData(toIds(ctx.query.ids ?? (ctx.request.body as any)?.ids));
    success(ctx, null, '删除成功');
  };
}
