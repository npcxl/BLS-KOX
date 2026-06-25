import { Context } from 'koa';
import { z } from 'zod';
import { ValidationError } from '../../../core/errors';
import { getAuditActor, writeOperationLog } from '../../../core/audit';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { pageSuccess, success } from '../../../core/response';
import { GlobalSearchService } from './global-search.service';
import { clearGlobalSearchUserCache } from './global-search-cache';

const configSchema = z.object({
  searchId: z.string().min(1).optional(),
  moduleKey: z.string().min(1),
  moduleName: z.string().min(1),
  permission: z.string().min(1),
  routePath: z.string().nullable().optional(),
  sourceTable: z.string().nullable().optional(),
  bizIdField: z.string().nullable().optional(),
  titleField: z.string().nullable().optional(),
  subtitleField: z.string().nullable().optional(),
  contentFields: z.string().nullable().optional(),
  tenantField: z.string().nullable().optional(),
  ownerField: z.string().nullable().optional(),
  deptField: z.string().nullable().optional(),
  createdByField: z.string().nullable().optional(),
  statusField: z.string().nullable().optional(),
  deletedField: z.string().nullable().optional(),
  enabled: z.number().int().optional(),
  sort: z.number().int().optional(),
  remark: z.string().nullable().optional(),
});

export class GlobalSearchController {
  constructor(private readonly service = new GlobalSearchService()) {}

  search = async (ctx: Context): Promise<void> => {
    const tenantId = getCurrentTenantId();
    const user = ctx.state.user;
    console.log('[global-search] search request', {
      query: ctx.query,
      tenantId,
      userId: user?.userId,
      fallbackTenantId: user?.tenantId,
      permsCount: user?.perms?.length ?? 0,
    });
    if (!user?.userId) throw new ValidationError('未登录');
    const data = await this.service.search(ctx.query, tenantId ?? user.tenantId, user.userId, user.perms ?? []);
    console.log('[global-search] search response', {
      keyword: String(ctx.query?.keyword ?? '').trim(),
      groupCount: data.length,
      groups: data.map((item) => ({ moduleKey: item.moduleKey, moduleName: item.moduleName, count: item.list.length })),
    });
    success(ctx, data, '查询成功');
  };

  listConfigs = async (ctx: Context): Promise<void> => {
    const result = await this.service.listConfigs(ctx.query);
    pageSuccess(ctx, result.rows, result.total);
  };

  saveConfig = async (ctx: Context): Promise<void> => {
    const parsed = configSchema.safeParse(ctx.request.body);
    if (!parsed.success) throw new ValidationError('参数错误', parsed.error.flatten());
    const searchId = await this.service.saveConfig(parsed.data);
    await writeOperationLog({
      actor: getAuditActor(ctx, getCurrentTenantId()),
      moduleName: 'global-search-config',
      businessType: 'SAVE',
      title: '保存全局搜索配置',
      requestMethod: ctx.method,
      requestUrl: ctx.path,
      requestParams: JSON.stringify(parsed.data),
      responseStatus: 200,
      success: '1',
    }).catch(() => undefined);
    success(ctx, { searchId }, '保存成功');
  };

  deleteConfig = async (ctx: Context): Promise<void> => {
    const searchId = z.string().min(1).parse(ctx.params.searchId);
    await this.service.deleteConfig(searchId);
    success(ctx, null, '删除成功');
  };

  rebuild = async (ctx: Context): Promise<void> => {
    const moduleKey = typeof (ctx.request.body as any)?.moduleKey === 'string' ? (ctx.request.body as any).moduleKey : undefined;
    const tenantId = typeof (ctx.request.body as any)?.tenantId === 'string' ? (ctx.request.body as any).tenantId : undefined;
    const affected = await this.service.rebuildSearchIndex(moduleKey, tenantId);
    success(ctx, { affected }, '重建成功');
  };
}
