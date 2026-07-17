# BLS-KOX 文档整改方案

> 目标：把当前分散、重复、部分过期的文档整理成一套适合开源项目阅读、维护和验收的文档体系。
>
> 当前建议先按本文档执行整理，不直接删除历史文档；先迁移、合并、加索引，再分批清理。

## 1. 当前问题结论

### 1.1 文档入口不够清晰

当前入口主要有：

- `README.md`
- `docs/getting-started.md`
- `docs/deployment.md`
- `bls-server/README.md`
- `bls-java-server/README.md`
- `bls-admin/README.md`

问题：

- `README.md` 已经很长，同时承担介绍、架构、快速开始、目录索引、路线图等职责。
- `docs/getting-started.md` 和 `README.md` 的快速开始内容重复。
- Java 启动说明同时出现在 `README.md`、`docs/getting-started.md`、`bls-java-server/README.md`。
- 新用户不容易判断应该先看哪个文档。

建议：

- `README.md` 只保留项目总览、快速启动最短路径、核心文档索引。
- 详细启动流程统一放到 `docs/getting-started.md`。
- Docker/生产部署统一放到 `docs/deployment.md`。
- 子项目 README 只保留该子项目本地开发说明和目录说明。

### 1.2 根目录专题文档过多

当前根目录存在多个中文专题文档：

- `CurdTable及其hook封装文档.md`
- `Webhook文档及其使用场景和底层集成.md`
- `全局搜索技术文档.md`
- `动态接口生成文档.md`
- `后端迁移方案设计规范.md`
- `存储桶通用文档.md`
- `系统多开策略及单开策略文档.md`

问题：

- 根目录视觉上比较乱。
- 这些文档多数是模块设计文档，应该归入 `docs/modules/`、`docs/frontend/` 或 `docs/archive/`。
- `后端迁移方案设计规范.md` 已经和当前 Java 后端并存方案有重叠，容易误导。
- `动态接口生成文档.md` 与 `docs/crud.md`、`docs/backend-koa.md` 有明显重复。

建议：

- 根目录只保留：
  - `README.md`
  - `CHANGELOG.md`
  - `CONTRIBUTING.md`
  - `SECURITY.md`
  - `LICENSE`
- 其他专题文档迁移到 `docs/` 子目录。

### 1.3 双后端文档存在重复

相关文档：

- `docs/backend-comparison.md`
- `docs/backend-koa.md`
- `docs/backend-java.md`
- `docs/api-compatibility.md`
- `docs/crud.md`
- `README.md`

问题：

- 双后端定位在 `README.md` 和 `backend-comparison.md` 都写了一遍。
- Koa CRUD 在 `backend-koa.md`、`crud.md`、`动态接口生成文档.md` 都写了一遍。
- Java CRUD 在 `backend-java.md` 和 `crud.md` 都写了一遍。
- API 兼容规范和后端架构说明边界不清。

建议职责划分：

- `backend-comparison.md`：只讲 Koa 和 Java 的定位差异、选择建议。
- `backend-koa.md`：只讲 Koa 内部架构、中间件链、路由、CRUD 工厂。
- `backend-java.md`：只讲 Java 内部架构、Spring Security、MyBatis-Plus、AOP 能力。
- `api-compatibility.md`：只讲两套后端必须保持一致的 API 合同。
- `crud.md`：只讲 CRUD 模型对比和新模块开发范式，不重复完整后端架构。

### 1.4 分布式与微服务文档边界需要收紧

相关文档：

- `docs/distributed-capabilities.md`
- `docs/microservices-roadmap.md`
- `docs/cache.md`
- `docs/rate-limit.md`
- `docs/idempotency.md`
- `docs/observability.md`

问题：

- `distributed-capabilities.md` 是当前实现说明。
- `microservices-roadmap.md` 是未来路线。
- 但 `distributed-capabilities.md` 顶部当前缺少明确说明：“当前不是微服务，不引入注册中心、网关、Nacos、Seata。”
- `distributed-capabilities.md` 中 Koa 分布式锁示例仍是旧 API，代码已改为结构化返回 `{ status: 'acquired' | 'busy' | 'unavailable' }`。

必须修复：

- 更新 Koa 分布式锁示例。
- 在 `distributed-capabilities.md` 顶部补充：

```md
当前不是微服务，不引入注册中心、网关、Nacos、Seata。
```

建议边界：

- `distributed-capabilities.md`：当前已经实现什么、接入了哪些接口、Redis key 如何看。
- `microservices-roadmap.md`：未来什么时候拆服务、如何拆、为什么现在不拆。
- `cache.md`：只讲缓存和 Redis key 规范。
- `rate-limit.md`：只讲限流。
- `idempotency.md`：只讲幂等。
- `observability.md`：只讲日志、Metrics、Trace。

### 1.5 API 版本和开放接口文档不够统一

相关文档：

- `docs/api-versioning.md`
- `docs/security.md`
- `docs/backend-koa.md`
- `docs/architecture.md`

问题：

- `/api/v1/`、`/openapi/v1/`、`/internal/` 的说明分散。
- `api-versioning.md` 里部分代码块标题使用了 `#`，在 Markdown 结构上会变成一级标题，影响目录。
- `security.md` 提到 `X-Idempotent-Key`，而当前主流实现使用 `Idempotency-Key`，需要确认并统一。

建议：

- 保留 `api-versioning.md` 作为唯一 API 版本说明。
- `security.md` 只引用 `api-versioning.md`，不重复路径细节。
- 统一幂等请求头命名为 `Idempotency-Key`，如果旧接口兼容 `X-Idempotent-Key`，需要明确说明“兼容旧 Header”。

## 2. 建议的新文档目录结构

建议整理为：

```text
docs/
├── index.md                         # 文档导航，总入口
├── getting-started.md               # 快速开始
├── deployment.md                    # 部署指南
├── production-checklist.md          # 生产检查清单
├── architecture/
│   ├── overview.md                  # 总体架构
│   ├── backend-comparison.md        # 双后端定位
│   ├── backend-koa.md               # Koa 架构
│   ├── backend-java.md              # Java 架构
│   ├── api-compatibility.md         # API 兼容规范
│   └── microservices-roadmap.md     # 微服务路线图
├── guides/
│   ├── crud.md                      # CRUD 开发指南
│   ├── api-versioning.md            # API 版本规范
│   ├── multi-tenant.md              # 多租户开发
│   ├── rbac.md                      # RBAC 权限
│   └── auth.md                      # 认证体系
├── distributed/
│   ├── distributed-capabilities.md  # 分布式能力总览
│   ├── cache.md                     # 缓存策略
│   ├── rate-limit.md                # 限流
│   ├── idempotency.md               # 幂等
│   ├── observability.md             # 可观测性
│   └── outbox.md                    # Outbox
├── modules/
│   ├── storage.md                   # 存储桶
│   ├── webhook.md                   # Webhook
│   ├── global-search.md             # 全局搜索
│   └── session-policy.md            # 单开/多开策略
├── frontend/
│   └── crud-table.md                # CrudTable 和 Hook
└── archive/
    └── java-migration-plan.md       # 历史迁移方案，标注已归档
```

如果暂时不想移动文件，可以先新增 `docs/index.md` 做导航，并在现有文档顶部加“归属/状态/维护说明”。

## 3. 逐文件处理清单

### 3.1 根目录文档

| 当前文件 | 建议处理 | 新位置 |
|---|---|---|
| `README.md` | 精简，保留项目介绍、最短启动、文档索引 | 保留根目录 |
| `CHANGELOG.md` | 保留 | 根目录 |
| `CONTRIBUTING.md` | 保留 | 根目录 |
| `SECURITY.md` | 保留 | 根目录 |
| `CurdTable及其hook封装文档.md` | 移入前端文档，改名 | `docs/frontend/crud-table.md` |
| `Webhook文档及其使用场景和底层集成.md` | 移入模块文档，改名 | `docs/modules/webhook.md` |
| `全局搜索技术文档.md` | 移入模块文档，改名 | `docs/modules/global-search.md` |
| `动态接口生成文档.md` | 与 `docs/crud.md` 合并或归档 | `docs/archive/dynamic-api-generation.md` |
| `后端迁移方案设计规范.md` | 已过期，归档 | `docs/archive/java-migration-plan.md` |
| `存储桶通用文档.md` | 移入模块文档，改名 | `docs/modules/storage.md` |
| `系统多开策略及单开策略文档.md` | 移入模块文档，改名 | `docs/modules/session-policy.md` |

### 3.2 `docs/` 当前文档

| 当前文件 | 建议处理 |
|---|---|
| `architecture.md` | 改名为 `architecture/overview.md`，只保留总览 |
| `backend-comparison.md` | 移入 `architecture/`，保留双后端定位 |
| `backend-koa.md` | 移入 `architecture/` |
| `backend-java.md` | 移入 `architecture/` |
| `api-compatibility.md` | 移入 `architecture/` |
| `microservices-roadmap.md` | 移入 `architecture/` |
| `crud.md` | 移入 `guides/`，合并动态接口生成相关内容 |
| `api-versioning.md` | 移入 `guides/`，修正误用的 `#` 标题 |
| `multi-tenant.md` | 移入 `guides/` |
| `rbac.md` | 移入 `guides/` |
| `auth.md` | 移入 `guides/` |
| `distributed-capabilities.md` | 移入 `distributed/`，更新 Koa 锁示例 |
| `cache.md` | 移入 `distributed/` |
| `rate-limit.md` | 移入 `distributed/` |
| `idempotency.md` | 移入 `distributed/` |
| `observability.md` | 移入 `distributed/` |
| `outbox.md` | 移入 `distributed/` |
| `security.md` | 保留在 `docs/` 或移入 `guides/`，但需统一 Header 名称 |
| `deployment.md` | 保留在 `docs/` |
| `production-checklist.md` | 保留在 `docs/` |
| `getting-started.md` | 保留在 `docs/` |

## 4. 必须立即修复的内容

### 4.1 修复 `distributed-capabilities.md` 的 Koa 锁示例

当前示例是旧 API：

```ts
const unlock = await lock.acquire('storage:upload', { leaseTime: 30, waitTime: 5 });
if (!unlock) {
  ctx.status = 409;
  ctx.body = { code: 409, message: '操作太频繁，请稍后再试' };
  return;
}
try { /* 业务逻辑 */ } finally { await unlock(); }
```

应改为：

```ts
const result = await lock.acquire('storage:upload', { leaseTime: 30, waitTime: 5 });

if (result.status === 'busy') {
  ctx.status = 409;
  ctx.body = { code: 409, message: '操作太频繁，请稍后再试' };
  return;
}

let unlock: (() => Promise<void>) | null = null;
if (result.status === 'acquired') {
  unlock = result.unlock;
}

// result.status === 'unavailable' 时降级执行原业务逻辑
try {
  // 业务逻辑
} finally {
  if (unlock) await unlock();
}
```

### 4.2 补充分布式文档边界说明

在 `docs/distributed-capabilities.md` 顶部加入：

```md
> 当前不是微服务，不引入注册中心、网关、Nacos、Seata。
> 当前目标是“模块化单体 + 分布式能力预留”。
```

### 4.3 统一幂等 Header 命名

检查并统一：

- 推荐名称：`Idempotency-Key`
- 不推荐继续使用：`X-Idempotent-Key`

需要检查：

- `docs/security.md`
- `docs/idempotency.md`
- `docs/api-compatibility.md`
- Koa `ReplayProtectionService`
- Koa `distributed/idempotency.ts`
- Java `IdempotentAspect`

如果代码只支持 `Idempotency-Key`，文档必须全部统一。

### 4.4 修复 Markdown 标题层级

以下文档存在代码说明误写成标题的问题：

- `docs/api-versioning.md`
- `docs/getting-started.md`
- `docs/deployment.md`
- `docs/production-checklist.md`
- `bls-java-server/README.md`
- `CONTRIBUTING.md`

示例：

```md
# 1. 启动 MySQL + Redis
```

在正文中应改为代码块注释：

```bash
# 1. 启动 MySQL + Redis
```

或者改为正常小标题：

```md
### 1. 启动 MySQL + Redis
```

## 5. 建议的文档阅读路径

### 5.1 新用户

1. `README.md`
2. `docs/getting-started.md`
3. `docs/backend-comparison.md`
4. `docs/deployment.md`

### 5.2 想使用 Koa 后端

1. `docs/backend-koa.md`
2. `docs/crud.md`
3. `docs/security.md`
4. `docs/observability.md`

### 5.3 想使用 Java 后端

1. `bls-java-server/README.md`
2. `docs/backend-java.md`
3. `docs/api-compatibility.md`
4. `docs/crud.md`

### 5.4 想理解双后端兼容

1. `docs/backend-comparison.md`
2. `docs/api-compatibility.md`
3. `docs/crud.md`
4. `docs/distributed-capabilities.md`

### 5.5 想看生产部署

1. `docs/deployment.md`
2. `docs/production-checklist.md`
3. `docs/security.md`
4. `docs/observability.md`

## 6. README 精简建议

`README.md` 建议保留以下结构：

```md
# BLS-KOX

## 项目定位
## 核心特性
## 架构图
## 快速启动
## 双后端选择
## 文档导航
## 路线图
## 贡献
## License
```

建议删除或下沉到其他文档：

- 过长的安全能力表格：移到 `docs/security.md`
- 详细 Quick Start：移到 `docs/getting-started.md`
- 详细目录结构：移到 `docs/architecture.md`
- 详细文档索引：移到 `docs/index.md`

README 要做到“开源首页”，不是“全部说明书”。

## 7. `docs/index.md` 建议内容

新增 `docs/index.md`：

```md
# BLS-KOX 文档中心

## 快速开始
- [快速开始](./getting-started.md)
- [部署指南](./deployment.md)
- [生产检查清单](./production-checklist.md)

## 架构
- [总体架构](./architecture.md)
- [双后端定位](./backend-comparison.md)
- [Koa 后端](./backend-koa.md)
- [Java 后端](./backend-java.md)
- [API 兼容规范](./api-compatibility.md)
- [微服务路线图](./microservices-roadmap.md)

## 开发指南
- [CRUD 工厂](./crud.md)
- [认证体系](./auth.md)
- [RBAC 权限](./rbac.md)
- [多租户](./multi-tenant.md)
- [API Versioning](./api-versioning.md)

## 分布式与可观测性
- [分布式能力](./distributed-capabilities.md)
- [缓存](./cache.md)
- [限流](./rate-limit.md)
- [幂等](./idempotency.md)
- [Outbox](./outbox.md)
- [可观测性](./observability.md)

## 模块专题
- Webhook
- 存储桶
- 全局搜索
- 登录态策略
- CrudTable
```

如果执行目录重构，再把链接改成新路径。

## 8. 分阶段整改计划

### Phase 1：不移动文件，只修内容

目标：低风险，立即提升准确性。

任务：

- 修 `distributed-capabilities.md` Koa 锁示例。
- 补“当前不是微服务”说明。
- 统一 `Idempotency-Key` 命名。
- 修明显 Markdown 标题层级问题。
- 新增 `docs/index.md`。
- 在 `README.md` 文档索引中加入 `docs/index.md`。

验收：

- 所有示例和当前代码一致。
- README 能清楚指向文档中心。
- 新用户能按阅读路径启动项目。

### Phase 2：归档根目录专题文档

目标：清理根目录。

任务：

- 新建：
  - `docs/modules/`
  - `docs/frontend/`
  - `docs/archive/`
- 移动根目录中文专题文档到对应目录。
- 保留旧文件路径兼容：可以在旧文件里只留一句“本文档已迁移到 xxx”。

验收：

- 根目录只剩项目级文档。
- 所有迁移后的文档链接可访问。

### Phase 3：合并重复文档

目标：降低长期维护成本。

任务：

- 将 `动态接口生成文档.md` 的有效内容合并到 `docs/crud.md`。
- 将 `后端迁移方案设计规范.md` 标记为历史归档。
- 将 Webhook / Storage / Global Search 文档统一格式。
- 拆分过长的 `README.md`，把细节下沉。

验收：

- 同一个概念只有一个主文档。
- 其他文档只引用主文档，不重复维护。

### Phase 4：建立文档规范

目标：以后不再乱。

新增 `docs/conventions.md`，规定：

- 文档命名使用英文 kebab-case。
- 根目录不新增模块文档。
- 每篇文档顶部包含：
  - 状态：`current` / `draft` / `deprecated` / `archive`
  - 适用范围
  - 最后维护点
- 示例必须和代码保持一致。
- 涉及接口路径必须写完整路径。
- 涉及双后端必须说明 Koa / Java 是否都支持。

## 9. Cursor 执行提示词

```text
请按 docs/documentation-restructure-plan.md 执行 Phase 1 文档整改，不改业务代码。

要求：
1. 新增 docs/index.md，作为文档中心。
2. 修复 docs/distributed-capabilities.md：
   - 顶部补充“当前不是微服务，不引入注册中心、网关、Nacos、Seata”
   - 更新 Koa 分布式锁示例为结构化返回 status: acquired/busy/unavailable
3. 全局搜索文档中的 X-Idempotent-Key，统一为 Idempotency-Key；如果代码同时兼容旧 Header，文档明确说明兼容。
4. 修复明显错误的 Markdown 标题层级，不要把代码注释写成一级标题。
5. README.md 中增加“文档中心”入口，指向 docs/index.md。
6. 不移动文件，不删除旧文档。
7. 不修改任何前端业务代码、后端业务代码、配置代码。

完成后输出变更清单和仍待 Phase 2 处理的文件列表。
```

## 10. 验收清单

- [ ] `docs/index.md` 存在，并能作为文档总入口。
- [ ] 根 `README.md` 能一眼看出项目定位、启动方式、文档入口。
- [ ] `distributed-capabilities.md` 与当前 Koa `createDistributedLock()` API 一致。
- [ ] `microservices-roadmap.md` 明确说明当前不是微服务。
- [ ] 全部文档统一使用 `Idempotency-Key`。
- [ ] 根目录专题文档有明确后续迁移计划。
- [ ] 没有把代码块注释误写成 Markdown 一级标题。
- [ ] 双后端相关文档边界清晰，不重复大段内容。
- [ ] Java 启动说明统一提到复制 `application.example.yml` 为 `application.yml`。
- [ ] Docker 拉镜像失败、Umi headers 配置错误等常见问题有文档入口。
