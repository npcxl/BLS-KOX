import { NotFoundError, ValidationError } from "../../../core/errors";
import { getCurrentTenantId } from "../../../middleware/tenant";
import { getPageParams } from "../../../shared/utils/pagination";
import {
  ConfigQuery,
  CreateConfigInput,
  UpdateConfigInput,
} from "./config.model";
import { ConfigRepository } from "./config.repository";

export class ConfigService {
  constructor(private readonly repository = new ConfigRepository()) {}

  list(query: ConfigQuery) {
    return this.repository.list(query, getPageParams(query));
  }

  async publicTheme() {
    const currentTenantId = getCurrentTenantId();
    return this.repository.findByKey(
      currentTenantId ?? undefined,
      "theme.default",
    );
  }

  private async fetchSystemConfigs() {
    const keys = [
      "sys.user.defaultPassword",
      "sys.app.name",
      "sys.demo.enabled",
      "sys.upload.maxSize",
      "sys.version",
      "sys.app.logo",
      "sys.user.defaultAvatar",
      "sys.login.multiDevice",
    ];
    const currentTenantId = getCurrentTenantId();
    const items = await Promise.all(
      keys.map((key) =>
        this.repository.findByKey(currentTenantId ?? undefined, key),
      ),
    );
    return items.filter((item): item is NonNullable<typeof item> =>
      Boolean(item),
    );
  }

  async current() {
    return this.fetchSystemConfigs();
  }

  async publicSystem() {
    return this.fetchSystemConfigs();
  }

  async detail(configId: string) {
    const config = await this.repository.findById(configId);
    if (!config) throw new NotFoundError("配置不存在");
    return config;
  }

  async add(input: CreateConfigInput): Promise<string> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) throw new ValidationError("缺少 tenantId，无法创建配置");
    const exists = await this.repository.findByKey(tenantId, input.configKey);
    if (exists) throw new ValidationError("配置键已存在");
    return this.repository.create(input);
  }

  async edit(input: UpdateConfigInput): Promise<void> {
    const old = await this.repository.findById(input.configId);
    if (!old) throw new NotFoundError("配置不存在");
    await this.repository.update(input);
  }
}
