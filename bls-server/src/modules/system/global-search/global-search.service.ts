import { ValidationError } from '../../../core/errors';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { GlobalSearchGroup, GlobalSearchQuery, SearchConfigInput, SearchConfigQuery } from './global-search.model';
import { GlobalSearchRepository } from './global-search.repository';
import { clearGlobalSearchConfigCache, getCachedGlobalSearchConfigs } from './global-search-cache';

export class GlobalSearchService {
  constructor(private readonly repository = new GlobalSearchRepository()) {}

  async search(query: GlobalSearchQuery, tenantId: string, userId: string, permissions: string[]): Promise<GlobalSearchGroup[]> {
    const keyword = String(query.keyword ?? '').trim();
    console.log('[global-search] service.search start', {
      keyword,
      tenantId,
      userId,
      permissionsCount: permissions.length,
      query,
    });
    if (keyword.length < 2) {
      console.log('[global-search] service.search short keyword', { keyword });
      return [];
    }

    const rows = await this.repository.searchIndex({
      tenantId,
      keyword,
      permissions,
      userId,
      limit: 30,
    });
    console.log('[global-search] service.search rows', { keyword, rowCount: rows.length });

    const map = new Map<string, GlobalSearchGroup>();
    for (const row of rows) {
      if (!map.has(row.moduleKey)) {
        map.set(row.moduleKey, { moduleKey: row.moduleKey, moduleName: row.moduleName, routePath: row.routePath, list: [] });
      }
      const group = map.get(row.moduleKey)!;
      if (group.list.length < 5) {
        group.list.push({
          id: row.id,
          title: row.title,
          subtitle: row.subtitle,
          moduleKey: row.moduleKey,
          moduleName: row.moduleName,
          routePath: row.routePath,
        });
      }
    }
    const result = Array.from(map.values()).filter((item) => item.list.length > 0);
    console.log('[global-search] service.search result', { keyword, groupCount: result.length });
    return result;
  }

  listConfigs(query: SearchConfigQuery) {
    return this.repository.listConfigs(query);
  }

  async enabledConfigs() {
    return getCachedGlobalSearchConfigs(this.repository);
  }

  async saveConfig(input: SearchConfigInput) {
    const id = await this.repository.saveConfig(input);
    await clearGlobalSearchConfigCache();
    return id;
  }

  async deleteConfig(searchId: string) {
    const existing = await this.repository.findConfig(searchId);
    if (!existing) throw new ValidationError('配置不存在');
    await this.repository.deleteConfig(searchId);
    await clearGlobalSearchConfigCache();
  }

  rebuildSearchIndex(moduleKey?: string, tenantId?: string) {
    return this.repository.rebuildSearchIndex(moduleKey, tenantId ?? getCurrentTenantId() ?? undefined);
  }
}
