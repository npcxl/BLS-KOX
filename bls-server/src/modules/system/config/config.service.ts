import { NotFoundError, ValidationError } from '../../../core/errors';
import { getPageParams } from '../../../shared/utils/pagination';
import { ConfigQuery, CreateConfigInput, UpdateConfigInput } from './config.model';
import { ConfigRepository } from './config.repository';

export class ConfigService {
  constructor(private readonly repository = new ConfigRepository()) {}

  list(query: ConfigQuery) {
    return this.repository.list(query, getPageParams(query));
  }

  async detail(configId: number) {
    const config = await this.repository.findById(configId);
    if (!config) throw new NotFoundError('配置不存在');
    return config;
  }

  async add(input: CreateConfigInput): Promise<number> {
    const exists = await this.repository.findByKey(input.tenantId ?? 0, input.configKey);
    if (exists) throw new ValidationError('配置键已存在');
    return this.repository.create(input);
  }

  async edit(input: UpdateConfigInput): Promise<void> {
    const old = await this.repository.findById(input.configId);
    if (!old) throw new NotFoundError('配置不存在');
    await this.repository.update(input);
  }
}
