import { NotFoundError, ValidationError } from '../../../core/errors';
import { getCurrentTenantId } from '../../../middleware/tenant';
import { PLATFORM_TENANT_ID } from '../../../shared/constants/tenant';
import { ThemeInput, ThemeQuery } from './theme.model';
import { ThemeRepository } from './theme.repository';

export class ThemeService {
  constructor(private readonly repository = new ThemeRepository()) {}

  list(query: ThemeQuery) {
    return this.repository.list(query);
  }

  async current() {
    const tenantId = getCurrentTenantId();
    return tenantId ? this.repository.findByTenant(tenantId) ?? this.repository.findByTenant(PLATFORM_TENANT_ID) : this.repository.findByTenant(PLATFORM_TENANT_ID);
  }

  async add(input: ThemeInput): Promise<string> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new ValidationError('缺少 tenantId，无法创建主题配置');
    const exists = await this.repository.findByTenant(tenantId);
    if (exists) throw new ValidationError('当前租户已存在主题配置');
    return this.repository.create(input);
  }

  async edit(input: ThemeInput & { themeId: string }): Promise<void> {
    const old = await this.repository.findById(input.themeId);
    if (!old) throw new NotFoundError('主题配置不存在');
    await this.repository.update(input);
  }

  async remove(ids: string[]): Promise<void> {
    if (ids.length === 0) throw new ValidationError('请选择要删除的数据');
    await this.repository.remove(ids);
  }
}
