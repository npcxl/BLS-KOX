# Koa 后端架构

## 概述

`bls-server` 是 BLS-KOX 的**默认主后端**，基于 Koa 3 + TypeScript 6 构建。采用函数式中间件链、泛型 CRUD 工厂、自动路由扫描等设计模式，深度集成多租户隔离、RBAC 权限、安全审计、限流等安全机制。

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | ≥ 22 |
| 框架 | Koa | 3.x |
| 语言 | TypeScript | 6.x |
| ORM | Kysely（Query Builder） | latest |
| 数据库驱动 | mysql2 | latest |
| 校验 | Zod | 4.x |
| 缓存/Session | ioredis（Redis 7） | latest |
| 密码加密 | Argon2 | latest |
| JWT | jsonwebtoken | latest |
| 可观测 | OpenTelemetry + Prometheus | latest |

## 目录结构

```
bls-server/src/
├── app.ts                   # 应用入口：创建 Koa 实例、注册中间件、启动服务
├── api/                     # 业务接口（自动扫描注册）
│   ├── auth/index.ts        # 登录/登出/刷新Token/用户信息
│   ├── system/              # 系统管理模块
│   │   ├── user/            # 用户管理（自定义 Router + Service）
│   │   ├── role/            # 角色管理
│   │   ├── menu/            # 菜单管理
│   │   ├── dept/            # 部门管理（树形结构）
│   │   ├── dict/            # 字典管理（纯 CRUD 工厂）
│   │   ├── config/          # 系统参数配置
│   │   ├── theme/           # 主题配置
│   │   ├── page-config/     # 动态页面列配置
│   │   ├── log/             # 操作/登录/安全/审计日志
│   │   ├── job/             # 定时任务
│   │   ├── storage/         # 文件存储（MinIO/S3/本地）
│   │   ├── webhook/         # Webhook 平台
│   │   ├── global-search/   # 全局搜索 Ctrl+K
│   │   ├── dashboard/       # 仪表盘数据
│   │   └── realtime/        # WebSocket 实时推送
│   └── common/excel/        # Excel 导入导出
├── core/                    # 核心基础设施
│   ├── router.ts            # 自动路由扫描器
│   ├── crud.ts              # 泛型 CRUD 工厂 defineCrudModule()
│   ├── database.ts          # MySQL 双连接池（Kysely + raw mysql2）
│   ├── audit.ts             # 操作审计日志
│   ├── security-audit.ts    # 安全审计日志（24 种事件、4 级风险）
│   ├── logger.ts            # 日志系统
│   ├── errors.ts            # 统一错误类
│   ├── request-context.ts   # AsyncLocalStorage 请求上下文
│   ├── response.ts          # 统一响应格式 {code, message, data}
│   └── sql.ts               # SQL 辅助工具
├── middleware/               # 中间件层
│   ├── auth.ts              # JWT 认证 + Session Center 校验
│   ├── permission.ts        # RBAC 权限 hasPerm() + 跨租户检测
│   ├── tenant.ts            # 租户注入中间件
│   ├── rate-limit.ts        # 多维度限流中间件
│   ├── replay-protection.ts # 防重放中间件（Timestamp + Nonce + HMAC）
│   └── blocked-ip.ts        # IP 封禁中间件
├── security/                # 安全体系
│   ├── data-scope/          # Data Scope 数据权限（ALL/TENANT/DEPT/SELF）
│   ├── session/             # Session Center（Redis 会话管理）
│   ├── event-center/        # 安全事件中心（规则引擎 + 自动处置）
│   ├── rate-limit/          # 限流规则引擎
│   ├── ownership.ts         # 资源所有权校验
│   └── file-security.ts     # 文件安全校验
├── shared/                  # 共享模块
│   └── utils/               # JWT、Redis、Snowflake ID、工具函数
├── observability/           # 可观测性
│   ├── tracing.ts           # OpenTelemetry Tracing
│   └── metrics.ts           # Prometheus Metrics（HTTP/Security/DB/Redis/WS）
├── queue/                   # 异步任务队列
│   └── worker.ts            # Job Worker（轮询 sys_jobs）
└── outbox/                  # Outbox Pattern
    └── publisher.ts         # 事务事件发布器
```

## 中间件链路

请求按以下顺序依次通过中间件链：

```
 1. errorHandler              → 全局 try/catch，统一错误格式
 2. helmet()                  → 安全 Header
 3. cors()                    → 跨域，生产环境白名单校验
 4. koaBody + bodyParser      → 请求体解析（multipart + JSON + form）
 5. requestContextMiddleware   → AsyncLocalStorage 初始化请求上下文
 6. httpMetricsMiddleware      → Prometheus HTTP 指标采集
 7. tenantMiddleware           → 从 JWT 预提取 tenantId
 8. replayProtectionMiddleware → 防重放/幂等性校验
 9. blockedIpMiddleware        → 被封禁 IP 拒绝
10. rateLimitMiddleware        → 多维度限流（IP/User/Tenant/Account）
11. apiVersion 路由改写         → /api/v1/* → /api/* 透明代理
12. router.routes()            → 核心业务路由（JWT Auth + hasPerm）
```

## 路由体系

### 三层路由前缀

| 前缀 | 鉴权方式 | 用途 |
|------|----------|------|
| `/api/v1/*` | JWT（jwtAuth + hasPerm） | 前端 SPA 业务接口 |
| `/openapi/v1/*` | API Key + HMAC-SHA256 + Nonce | 第三方开放接口 |
| `/internal/*` | IP 白名单 + Shared Token（SHA256） | 内部服务调用 |

### 自动路由扫描

`src/core/router.ts` 中的 `scanAndRegister()` 函数自动递归扫描 `src/api/` 目录：

- **导出 `config` 对象**（含 `table` + `pkField`）→ 自动调用 `defineCrudModule(config)`
- **导出 `default` Router 实例** → 直接注册为 Koa Router（自定义接口）
- **导出函数** → 按函数名推断 HTTP 方法和路由路径：
  - `login` → `POST /{prefix}/login`（无鉴权）
  - `addXxx` → `POST /{prefix}/add-xxx`（JWT）
  - `editXxx` → `PUT /{prefix}/edit-xxx`（JWT）
  - `getXxx` → `GET /{prefix}/xxx`（JWT）
  - `public*` 前缀 → 跳过 JWT 鉴权

## CRUD 工厂：`defineCrudModule()`

这是 Koa 后端最核心的设计模式。一行配置即可生成完整的 CRUD 接口。

### 基本用法

```typescript
// bls-server/src/api/system/dict/index.ts
export const config = {
  table: 'sys_dict_data',
  pkField: 'dict_code',
  searchFields: ['dict_label', 'dict_value'],
  name: '字典',
  permPrefix: 'system:dict',
};
```

### 自动生成的端点

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| `GET` | `/list` | `hasPerm('{permPrefix}:list')` | 分页列表 + 关键字搜索 + 动态字段过滤 |
| `POST` | `/add` | `hasPerm('{permPrefix}:add')` | 新增（Snowflake ID、Zod 校验、自动注入 tenant_id） |
| `PUT` | `/edit` | `hasPerm('{permPrefix}:edit')` | 编辑（主键校验、租户隔离、Data Scope） |
| `DELETE` | `/remove` | `hasPerm('{permPrefix}:remove')` | 批量删除（软删除/硬删除、租户隔离） |
| `PUT` | `/status` | `hasPerm('{permPrefix}:status')` | 状态切换 |

### 完整配置项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `table` | `string` | **必填** | 数据库表名 |
| `pkField` | `string` | **必填** | 主键字段名（snake_case） |
| `prefix` | `string` | 路径推导 | 路由前缀 |
| `searchFields` | `string[]` | - | 关键字模糊搜索的字段列表 |
| `tenantField` | `string` | `'tenant_id'` | 租户字段名 |
| `statusField` | `string` | `'status'` | 状态字段名 |
| `softDelete` | `boolean` | `true` | 是否使用软删除（`deleted = 0/1`） |
| `name` | `string` | - | 模块中文名（用于审计日志） |
| `permPrefix` | `string` | - | RBAC 权限前缀，为空则跳过鉴权 |
| `schema` | `{ create?, update? }` | - | Zod 校验 Schema |
| `dataScope` | `false \| DataScopeColumnMapping` | `false` | 数据权限列映射配置 |
| `onWrite` | `() => void` | - | 写入前回调（清缓存等） |
| `transactional` | `boolean` | `false` | 是否使用数据库事务包裹写操作 |
| `onTransactionCommitted` | `() => void` | - | 事务提交后回调（发送事件等） |

### 混合模式

自定义 Router 与 CRUD 工厂并存：

```typescript
// 导出自定义 Router 覆盖 /list（树形数据）
const router = new Router({ prefix: '/system/dept' });
router.get('/list', jwtAuth(), async (ctx) => {
  // 自定义树形查询逻辑
});
export default router;

// 同时导出 config → add/edit/remove/status 自动兜底
export const config = {
  table: 'sys_dept',
  pkField: 'dept_id',
  permPrefix: 'system:dept',
};
```

### 内置安全能力

CRUD 工厂在每个端点上自动注入以下安全机制：

- **租户隔离**：所有查询自动附加 `WHERE tenant_id = ?`
- **软删除过滤**：列表/编辑/删除自动附加 `WHERE deleted = 0`
- **Data Scope**：基于角色 `dataScope` 属性构建数据权限 WHERE 条件（ALL / TENANT / DEPT / DEPT_AND_CHILDREN / SELF）
- **Snowflake ID**：新增时自动生成分布式 ID
- **snake_case ↔ camelCase**：入参自动转蛇形，出参自动转驼峰
- **Zod 校验**：可选的输入 Schema 校验（`schema.create` / `schema.update`）
- **事务支持**：`transactional: true` 将写操作包裹在数据库事务中
- **最大分页限制**：`pageSize` 上限 100

## 认证与安全体系

### JWT 认证流程

```
请求 → parseBearerToken → verifyToken → Session Center 校验 → AuthService.profile → ctx.state.user
```

- JWT 验证后通过 Redis Session Center 二次校验会话有效性
- 支持 `optional: true` 允许匿名访问
- 失败时写入安全审计日志

### RBAC 权限控制

- `hasPerm(perm)` 检查用户 `ctx.state.user.perms` 数组
- 平台租户（`tenantId === '000000'`）或通配符 `*` 自动放行
- 跨租户访问自动检测并记录 HIGH 风险日志

### 防重放保护

- 时间戳窗口（默认 120 秒）
- Nonce 去重（Redis 存储已用 Nonce）
- HMAC 签名校验（`X-Signature` 头）
- 幂等 Key 支持（`Idempotency-Key` 头）

### 限流

- 多维度：IP / User / Tenant / Account
- Redis Lua 滑动窗口
- 可配置规则，支持通配符路径匹配

### Session Center

Redis 键设计：`session:{tenantId}:{userId}:{sessionId}`

- 创建/获取/验证/吊销 Session
- `revokeAll()` 通过 Set 索引批量吊销
- Refresh Token 复用检测
- 密码修改 → 全部设备失效

### 安全事件中心

- 被动聚合：5 分钟窗口内按 IP 聚合安全事件
- 风险评估：规则引擎评分 → 触发自动处置
- 处置动作：ALERT / BLOCK_IP / LOCK_ACCOUNT / REVOKE_ALL_SESSIONS

## 数据访问层

### 双连接池设计

- **Kysely Pool**：用于 Kysely Query Builder（类型安全）
- **Raw mysql2 Pool**：用于原始 SQL 和事务操作

### 数据库代理（Proxy）

所有 Kysely QueryBuilder 方法通过 Proxy 自动注入：
- 连接错误重试（指数退避，最多 3 次）
- Prometheus 指标采集（耗时/错误计数）
- TCP keep-alive 和连接健康管理

## 后台任务

### Job Worker

- 每 2 秒轮询 `sys_jobs` 表
- `SELECT ... FOR UPDATE SKIP LOCKED` 原子领取
- 超时控制（默认 60s）
- Graceful Shutdown：等待进行中任务完成

### Outbox Pattern

- 事务内写入事件（与业务共享同一事务）
- 原子领取 + Stale Recovery
- 指数退避重试（2s → 4s → 8s），3 次失败进入 Dead Letter

## 可观测性

### OpenTelemetry Tracing

- OTLP HTTP Exporter
- 自动 instrumentation：HTTP、Koa、MySQL2、ioredis
- 健康检查端点排除在 trace 外

### Prometheus Metrics

覆盖维度：

| 类别 | 指标 |
|------|------|
| HTTP | 请求计数、耗时直方图、错误计数 |
| 安全 | 安全事件、限流拒绝、重放拒绝、幂等冲突、Refresh 复用、跨租户访问 |
| 数据库 | 查询耗时、查询错误、连接池状态 |
| Redis | 操作耗时、操作错误 |
| Session/WS | 活跃会话数、WebSocket 连接数 |
| Queue/Outbox | 等待/失败/完成计数、死信计数 |

## 与其他后端的关系

Koa 后端是 BLS-KOX 的**默认主后端**，功能最完整。Java 后端（`bls-java-server`）是**并存后端**，二者 API 完全兼容，共用同一套 MySQL、Redis 和前端代码。

详见：
- [Java 后端架构](./backend-java.md)
- [API 兼容性规范](./api-compatibility.md)
- [CRUD 工厂（双后端对比）](./crud.md)
