import Router from 'koa-router';
import { Context } from 'koa';
import { getDb } from '../../../core/database';
import { jwtAuth } from '../../../middleware/auth';
import { hasPerm } from '../../../middleware/permission';

const router = new Router({ prefix: '/system/global-search' });
const T = 'sys_global_search_config';

router.get('/search', jwtAuth(), hasPerm('system:global-search:search'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const q: any = ctx.query;
  const keyword = String(q.keyword ?? '').trim();
  if (!keyword || keyword.length < 2) { ctx.body = { code: 200, data: [] }; return; }

  // 获取当前用户信息做权限过滤
  const user = ctx.state.user as any;
  const tenantId = user?.tenantId ?? '000000';

  // 在搜索索引中按 keyword 模糊匹配
  const rows = await db.selectFrom('sys_search_index').selectAll()
    .where('tenant_id', '=', tenantId)
    .where('deleted', '=', 0)
    .where('status', '=', '0')
    .where((eb: any) => eb.or([
      eb('title', 'like', `%${keyword}%`),
      eb('subtitle', 'like', `%${keyword}%`),
      eb('content', 'like', `%${keyword}%`),
    ]))
    .orderBy('create_time', 'desc')
    .limit(50)
    .execute();

  // 按模块分组
  const groups: Record<string, { moduleKey: string; moduleName: string; routePath: string | null; list: any[] }> = {};
  for (const r of rows) {
    const mk = r.module_key;
    if (!groups[mk]) {
      groups[mk] = { moduleKey: mk, moduleName: r.module_name, routePath: r.route_path, list: [] };
    }
    groups[mk].list.push({
      id: r.biz_id,
      title: r.title,
      subtitle: r.subtitle,
      moduleKey: mk,
      moduleName: r.module_name,
      routePath: r.route_path,
    });
  }
  ctx.body = { code: 200, data: Object.values(groups) };
});
router.get('/config/list', jwtAuth(), hasPerm('system:global-search:config:list'), async (ctx: Context) => {
  ctx.body = { code: 200, data: await (await getDb()).selectFrom(T).selectAll().where('deleted','=',0).execute() };
});
router.post('/config/save', jwtAuth(), hasPerm('system:global-search:config:save'), async (ctx: Context) => {
  const db = (await getDb()) as any; const b: any = ctx.request.body;
  if (b.searchId) await db.updateTable(T).set(b).where('search_id','=',b.searchId).execute();
  else await db.insertInto(T).values(b).execute();
  ctx.body = { code: 200, message: '保存成功' };
});
router.delete('/config/:id', jwtAuth(), hasPerm('system:global-search:config:delete'), async (ctx: Context) => {
  await (await getDb()).updateTable(T).set({deleted:1}).where('search_id','=',ctx.params.id).execute();
  ctx.body = { code: 200, message: '删除成功' };
});
router.get('/index/modules', jwtAuth(), hasPerm('system:search-index:rebuild'), async (ctx: Context) => {
  const rows = await (await getDb()).selectFrom(T).select(['module_key','module_name'])
    .where('enabled','=',1).where('deleted','=',0).orderBy('sort','asc').execute();
  ctx.body = { code: 200, data: rows.map((r:any) => ({ moduleKey: r.module_key, moduleName: r.module_name })) };
});

router.post('/index/rebuild', jwtAuth(), hasPerm('system:search-index:rebuild'), async (ctx: Context) => {
  const db = (await getDb()) as any;
  const body: any = ctx.request.body ?? {};
  const moduleKeys: string[] | undefined = body.moduleKeys;

  // 获取启用的搜索配置
  let configQuery = db.selectFrom(T).selectAll().where('enabled','=',1).where('deleted','=',0);
  if (moduleKeys && moduleKeys.length > 0) {
    configQuery = configQuery.where('module_key','in',moduleKeys);
  }
  const configs = await configQuery.execute();

  if (!configs.length) { ctx.body = { code: 400, message: '未找到可用的搜索配置' }; return; }

  const result = { totalTables: configs.length, successTables: 0, failedTables: 0, totalRows: 0, details: [] as any[] };

  for (const cfg of configs) {
    try {
      const tableName = cfg.source_table;
      if (!tableName) {
        result.failedTables++;
        result.details.push({ moduleKey: cfg.module_key, moduleName: cfg.module_name, rowCount: 0, error: '未配置来源表' });
        continue;
      }

      // 查询来源表的所有有效数据
      let query = db.selectFrom(tableName).selectAll();
      if (cfg.deleted_field) query = query.where(cfg.deleted_field, '=', 0);

      const rows = await query.execute();
      if (!rows.length) {
        result.successTables++;
        result.details.push({ moduleKey: cfg.module_key, moduleName: cfg.module_name, rowCount: 0 });
        continue;
      }

      // 构建索引并 UPSERT
      let idxCount = 0;
      for (const row of rows) {
        const tenantId = cfg.tenant_field ? (row[cfg.tenant_field] ?? '000000') : '000000';
        const bizId = cfg.biz_id_field ? String(row[cfg.biz_id_field] ?? '') : '';
        const title = cfg.title_field ? (row[cfg.title_field] ?? '') : '';
        const subtitle = cfg.subtitle_field ? String(row[cfg.subtitle_field] ?? '') : null;
        const contentParts: string[] = [];
        if (cfg.content_fields) {
          for (const f of cfg.content_fields.split(',')) {
            const v = row[f.trim()];
            if (v != null) contentParts.push(String(v));
          }
        }
        const content = contentParts.length ? contentParts.join(' ') : null;
        const ownerId = cfg.owner_field ? String(row[cfg.owner_field] ?? null) : null;
        const deptId = cfg.dept_field ? String(row[cfg.dept_field] ?? null) : null;
        const createdBy = cfg.created_by_field ? String(row[cfg.created_by_field] ?? null) : null;
        const status = cfg.status_field ? String(row[cfg.status_field] ?? '0') : '0';

        const indexId = `${tenantId}:${cfg.module_key}:${bizId}`;
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

        await db.replaceInto('sys_search_index').values({
          index_id: indexId, tenant_id: tenantId, module_key: cfg.module_key,
          module_name: cfg.module_name, biz_id: bizId, title: String(title),
          subtitle, content, permission: cfg.permission, route_path: cfg.route_path,
          owner_id: ownerId, dept_id: deptId, created_by: createdBy,
          status, deleted: 0, source_table: tableName,
          create_time: now, update_time: now,
        }).execute();
        idxCount++;
      }

      result.successTables++;
      result.totalRows += idxCount;
      result.details.push({ moduleKey: cfg.module_key, moduleName: cfg.module_name, rowCount: idxCount });
    } catch (err: any) {
      result.failedTables++;
      result.details.push({ moduleKey: cfg.module_key, moduleName: cfg.module_name, rowCount: 0, error: err?.message || '未知错误' });
    }
  }

  ctx.body = { code: 200, message: `重建完成：${result.totalRows}条索引`, data: result };
});

export default router;
