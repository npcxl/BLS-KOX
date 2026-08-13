---
name: bls-kox
description: >-
  BLS-KOX 多租户 SaaS 平台项目专用技能。提供仓库结构、双后端架构（Koa/TypeScript 与
  Spring Boot/Java 21）、MySQL 表规范、API 兼容约定、CRUD 工厂、安全与租户隔离模式、
  常用命令和文档索引。当在 C:\git-bls\BLS-KOX 或任一 bls-* 子项目中进行功能开发、Bug
  修复、重构、测试、文档编写、部署或代码答疑时使用。
---

# BLS-KOX 项目知识

## 工作顺序

1. 先确定任务影响的子项目：`bls-admin`、`bls-server`、`bls-java-server`、`bls-event-service`、`sql/`、`docs/`、根部署配置。
2. 先查对应文档：入口 `docs/index.md`；Koa `docs/backend-koa.md`；Java `docs/backend-java.md`；双后端 API 规范 `docs/api-compatibility.md`；文档规范 `docs/conventions.md`。
3. 需要表结构细节时读 `references/database-schema.md`。
4. 写多租户业务表或接口时，先套用下方“硬性约束”。

## 模块与端口

| 模块 | 说明 | 端口 |
|------|------|------|
| `bls-admin/` | React 19 + Ant Design Pro 6 + UmiJS Max 前端 | 本地 dev 9000 |
| `bls-server/` | 默认主后端，Koa 3 + TypeScript 6 + Kysely + Zod | 本地 6001，Docker 7001 |
| `bls-java-server/` | 兼容并存后端，Spring Boot 3.3.5 + Java 21 + MyBatis-Plus | 8080 |
| `bls-ai-service/` | AI 微服务，SSE 流式输出 | Docker 7201 |
| `bls-event-service/` | 可选事件/审计微服务 | Docker 7101 |
| `sql/Init.sql` | 双后端共享的完整表结构和种子数据 | - |
| `deploy/`, `docker-compose*.yml`, `nginx*.conf` | 部署、监控、反向代理 | Nginx 8088:80 |

一次只启用一套后端；前端不变，通过 `bls-admin/config/proxy.ts` 或 Nginx `upstream` 在 Koa 与 Java 之间切换。

## 常用命令

### 根目录
```powershell
docker compose up -d --build                 # 全栈，默认 Koa
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mysql redis
npm run release:patch|minor|major            # 版本发布脚本
```

### bls-admin
```powershell
npm install
npm run dev        # 9000
npm run tsc        # 类型检查（npm run lint 同）
npm run test       # Vitest
npm run build      # max build
```

### bls-server
```powershell
npm install
cp .env.example .env   # PowerShell: Copy-Item .env.example .env
npm run dev        # 本地 6001
npm run lint       # tsc --noEmit
npm run test       # Vitest
npm run build
```

### bls-rust-server
```powershell
cargo check
cargo test
cargo fmt --all
cargo build --release
```
### bls-java-server
```powershell
mvn test
mvn clean package -DskipTests
java -jar target/bls-java-server-1.0.0.jar
```

## 架构要点

- `bls-admin` 通过 Nginx 访问 `/api`、`/ws`、`/files`，Koa 和 Java 暴露同一套 API 契约。
- 双后端共享 MySQL 8.0、Redis 7、MinIO；`bls-server` 与 `bls-ai-service` 协作，对话记录由 `bls-server` 持久化，模型调用由 `bls-ai-service` 执行并 SSE 返回。
- Koa 路由由 `src/core/router.ts` 自动扫描 `src/api/`；Java 使用传统 `controller/service/mapper/entity` 分层。

## Koa 后端关键模式

- CRUD 工厂：`defineCrudModule(config)` 自动生成 `/list`、`/:id`、`/add`、`/edit`、`/remove`、`/status`。
- 必填配置：`table`、`pkField`；常用配置：`searchFields`、`tenantField`、`statusField`、`softDelete`、`permPrefix`、`schema`、`dataScope`、`transactional`。
- 混合模式：导出 `router` 自定义覆盖某些端点，同时导出 `config` 让 CRUD 工厂兜底。
- 鉴权组合：`jwtAuth()`、`hasPerm('system:user:list')`；租户上下文由 `tenantMiddleware` 注入。
- 统一响应：`{ code, message, data, total }`；成功 `code=200`，分页参数 `pageNum`/`pageSize`（`pageSize` 最大 100）。

## Java 后端关键模式

- 标准 CRUD 继承 `BaseCrudController` / `BaseCrudService`，声明搜索字段、字段映射和新增/编辑赋值。
- 权限标识使用 `PERM_` 前缀（例如 `PERM_system:user:list`），与 Koa 去掉前缀后保持一致。
- 统一响应体 `ApiResponse<T>`：`{ code, message, data, total }`。
- MyBatis-Plus 开启驼峰映射、分页插件、自动填充 `create_time`/`update_time`、`@TableLogic` 软删除。
- Knife4j 文档：`http://localhost:8080/doc.html`；Actuator 端点位于 `/internal/*`。

## 硬性约束

- **租户隔离**：所有多租户表必须按 `tenant_id` 过滤；平台租户是字符串 `000000`，拥有跨租户能力，不是数字 `0`。
- **软删除**：`deleted` 为 `tinyint`，`0` 有效、`1` 删除；列表、编辑、删除查询必须过滤 `deleted = 0`。
- **状态值**：`status` 使用 `char(1)`，`0` 正常/启用，`1` 停用/禁用。
- **命名**：数据库列 `snake_case`，TypeScript/Java 变量 `camelCase`，文件/目录 `kebab-case`。
- **时间列**：统一 `create_time`、`update_time`；排序列用 `sort_num`，不要用 `created_at`/`order_num`。
- **主键**：使用 Snowflake 生成的 `varchar(32)` 字符串 ID；种子数据可用短 ID（如 `000001`）。
- **API 兼容**：新增或修改 API 时，双后端需同步路径、方法、参数名、响应字段、权限标识、分页与错误行为。
- **密码**：Koa 用 Argon2id，Java 用 Argon2；不得明文存密码。
- **密钥**：从 `.env.example` / `.env.docker.example` 拷贝，修改所有 `CHANGE_TO_*`，不得提交真实密钥。

## 安全与认证

- JWT：Access Token 15 分钟，Refresh Token 7 天且轮换；Session Center 存 Redis `acc:{jti}` / `ref:{jti}`。
- Refresh Token 复用检测：同一 RT 第二次使用立即吊销该用户全部会话并记录 `REFRESH_TOKEN_REUSE`。
- 防重放：Timestamp + Nonce + 可选 HMAC；幂等头 `Idempotency-Key`（兼容 `X-Idempotent-Key`）。
- 路由安全边界：`/api/v1/` JWT；`/openapi/v1/` API Key + HMAC + Timestamp + Nonce；`/internal/` Service Token + IP 白名单。
- 安全事件写 `sys_security_log`，事件中心可触发封禁 IP、锁定账户、吊销会话。
- Data Scope：`ALL` / `TENANT` / `DEPT` / `DEPT_AND_CHILDREN` / `SELF` / `CUSTOM`。

## 变更后验证

- 前端：`cd bls-admin; npm run tsc; npm run test`。
- Koa：`cd bls-server; npm run lint; npm run test`。
- Java：`cd bls-java-server; mvn test`。
- 若改数据库：同步 `sql/Init.sql`，并检查 `docs/` 中相关文档是否需要更新。

## 文档导航

- 快速开始：`docs/getting-started.md`
- 架构与双后端对比：`docs/architecture.md`、`docs/backend-comparison.md`
- CRUD：`docs/crud.md`、`docs/backend-koa.md`、`docs/backend-java.md`
- 安全/租户/认证：`docs/security.md`、`docs/multi-tenant.md`、`docs/auth.md`
- 部署：`docs/docker-deploy.md`、`docs/deployment.md`、`docs/production-checklist.md`