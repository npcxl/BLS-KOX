---
name: bls-kox
description: >-
  This skill should be used when working on the BLS-KOX multi-tenant SaaS platform.
  It provides comprehensive knowledge about the project's triple-backend architecture
  (Koa TypeScript + Spring Boot Java + Rust Axum), multi-module monorepo structure,
  AI microservice, database schema, API conventions, security patterns, and deployment
  configuration.
  Use this skill when adding features, fixing bugs, refactoring, or answering
  questions about any part of the BLS-KOX codebase.
---

# BLS-KOX Project Knowledge

## Overview

BLS-KOX is an open-source multi-tenant SaaS backend framework and admin dashboard template featuring a **triple-backend architecture**. Three API-compatible backends (Koa TypeScript, Spring Boot Java 21, and Rust Axum) share one React frontend, one MySQL database, and one Redis instance. An additional AI microservice (bls-ai-service) handles all AI/LLM capabilities. Licensed under Mulan PSL v2.

## Current Branch: `master` (dev)

The `master` branch contains the full monorepo with all backends. The `dev` branch tracks the same content. When working on individual projects, stay on `master` branch. The project has been split into 5 independent repositories via git branches (`project/admin`, `project/koa`, `project/java`, `project/event-service`, `project/deploy`).

## Repository Structure

The project is a **monorepo** at `c:/git-bls/BLS-KOX/` with these sub-projects:

| Directory | Purpose | Tech Stack | Port |
|-----------|---------|------------|------|
| `bls-admin/` | Admin frontend SPA | React 19, Ant Design Pro 6, UmiJS Max, TypeScript | 9000 |
| `bls-server/` | Primary backend (Koa) | Koa 3.x, TypeScript, Kysely ORM, Zod | 6001 |
| `bls-java-server/` | Alternative backend (Java) | Spring Boot 3.3.5, Java 21, MyBatis-Plus 3.5 | 8080 |
| `bls-rust-server/` | Alternative backend (Rust) | Axum, SQLx, Tokio | 6002 |
| `bls-ai-service/` | AI 微服务 | Koa 3.x, TypeScript, OpenAI SDK | 7201 |
| `bls-event-service/` | Event/audit microservice | Koa 3.x, TypeScript, MySQL | 7101 |
| `sql/` | Shared database schema | MySQL 8.0 | - |
| `docs/` | Documentation | Markdown | - |
| Root | Deployment configs | Docker Compose, Nginx, env templates | - |

## Architecture

```
bls-admin (React 19) ──HTTP/WS──▶ Nginx (port 80) ──/api/──▶ bls-server (Koa, 6001)
                                                              OR
                                                              bls-java-server (Java, 8080)
                                                              OR
                                                              bls-rust-server (Rust, 6002)
                                       │
                                       ├──▶ MySQL 8.0 (shared)
                                       ├──▶ Redis 7 (shared sessions/cache/rate-limit)
                                       ├──▶ bls-ai-service (7201, AI completions/models/ocr/crud/sql/audit/config)
                                       └──▶ bls-event-service (7101, optional audit)
```

**AI 请求分流（本地 dev）：**
- `/api/ai/chat/conversations`（对话 CRUD）→ Koa bls-server (6001) 或 Rust bls-rust-server (6002)
- `/api/ai/` 其余（completions / models / ocr / crud / sql / audit / config）→ bls-ai-service (7201)
- 由 `bls-admin/config/proxy.ts` 配置

**Key design decisions:**
1. Only ONE backend is active at a time (switched via Nginx upstream or proxy.ts)
2. All backends share the same MySQL schema (`sql/Init.sql`) and Redis
3. All backends expose **API-compatible** REST endpoints — frontend code never changes
4. Multi-tenant isolation via `tenant_id` row-level filtering on all tables
5. `tenant_id = '000000'` represents the platform super-admin
6. AI 能力统一由 bls-ai-service 微服务提供，各主后端不自重复实现

## Frontend (`bls-admin/`)

### Key Commands
```bash
cd bls-admin
npm install
npm run dev          # Start dev server on port 9000 (Umi_ENV=dev)
npm run start:no-mock  # Start without mock
npm run build        # Production build
npm run tsc          # Type check
npm run test         # Run tests (vitest)
npm run lint         # Biome lint
```

### Directory Layout
```
bls-admin/src/
├── app.tsx                       # App entry, backend menu mapping via mapBackendMenus
├── pages/                        # Page components
│   ├── dashboard/                # Admin dashboard (glassmorphism style)
│   ├── ai/                       # AI 模块
│   │   ├── workbench/            # KOX-AI 聊天工作台 (Bubble + Sender + XMarkdown)
│   │   └── usage/                # AI 用量统计（KPI + 瀑布流 + 调用明细）
│   ├── account/                  # Account center & settings
│   ├── form/                     # Example forms
│   ├── list/                     # Example lists
│   ├── profile/                  # Profile pages
│   ├── result/                   # Result pages
│   ├── system/                   # System management pages
│   │   ├── ai-model/             # AI 模型配置（CRUD，支持 API/本地模型）
│   │   ├── config/               # System config
│   │   ├── dept/                 # Department management
│   │   ├── dict/                 # Dictionary management
│   │   ├── file-config/          # File & storage config
│   │   ├── log/                  # Log center (operation/upload/login/security/sql-audit)
│   │   ├── menu/                 # Menu management
│   │   ├── role/                 # Role management
│   │   ├── tenant-package/       # Tenant & package management
│   │   ├── theme/                # Theme configuration
│   │   └── user/                 # User management
│   └── exception/                # 403/404/500
├── components/                   # Shared components
│   ├── CrudTablePage/            # Core CRUD table component (with usePageConfig)
│   └── GlobalRealtimeProvider/   # WebSocket realtime provider
├── services/                     # API service layer
│   ├── ai/                       # AI 服务
│   │   ├── module-builder.ts     # chatCompletions() — OpenAI SSE 流式解析
│   │   ├── chat-provider.ts      # 对话 CRUD + chatStream()
│   │   └── conversation.ts       # 对话持久化
│   ├── system/                   # System API services
│   ├── ant-design-pro/           # Legacy API services
│   └── security/                 # replayInterceptor
├── hooks/                        # Custom hooks
│   ├── useWebSocket.ts           # WebSocket connection
│   ├── usePageConfig.ts          # Dynamic page column config hook
│   ├── usePermission.ts          # Permission check
│   └── useDict.ts                # Dictionary helpers
├── auth/                         # Authentication
│   ├── token-store.ts            # Unified token storage (禁止直接 localStorage)
│   └── auth-types.ts             # TokenPair types
└── locales/                      # i18n
```

### Key Patterns
- Pages use `CrudTablePage` component for standard CRUD operations
- API requests go through the service layer under `services/`
- **Dynamic columns**: Use `usePageConfig('page_code')` hook from `@/hooks/usePageConfig` to get `proColumns` from `sys_page_column_config` database table
- **formColumns**: Manually written as `ProFormColumnsType` array for add/edit forms
- WebSocket connections via `useWebSocket` hook for realtime data
- AI 对话工作台使用 `@ant-design/x` 的 `Bubble` + `Sender` + `XMarkdown`
- 禁止直接 `localStorage.setItem/getItem`，必须通过 `token-store.ts`
- 前端所有 `fetch` 调用应通过 `services/` 层，不直接在组件内调用

### 菜单机制（重要）
1. 菜单显示 = 动态（后端 `/api/auth/profile` 的 menus，由 `sys_menu` + `sys_role_menu` 决定），前端 `app.tsx` 的 `mapBackendMenus` 渲染
2. 页面可访问性 = 静态（`config/routes.ts` 的 umi 路由表，决定 path→component）
3. 加新菜单页：数据库加菜单 + 角色关联，且 `config/routes.ts` 加 route、写页面组件

## Koa Backend (`bls-server/`) — Port 6001

### Key Commands
```bash
cd bls-server
npm install
cp .env.example .env    # Configure DB/Redis connections
npm run db:init         # Initialize database
npm run dev             # Start dev server (tsx watch)
npm run build           # Compile TypeScript
```

### Directory Layout
```
bls-server/src/
├── app.ts                   # Koa app entry point
├── api/                     # API endpoints (auto-scanned and registered)
│   ├── auth/                # Login/logout/token/profile
│   ├── system/              # 18+ system modules
│   │   ├── user/            # User CRUD
│   │   ├── role/            # Role CRUD
│   │   ├── menu/            # Menu CRUD
│   │   ├── dept/            # Department CRUD
│   │   ├── tenant/          # Tenant management
│   │   ├── config/          # System configuration
│   │   ├── dict/            # Dictionary management
│   │   ├── log/             # Audit & operation logs (含 SQL 审计)
│   │   ├── security/        # Security dashboard
│   │   ├── storage/         # File storage config
│   │   ├── webhook/         # Webhook management
│   │   ├── page-config/     # Dynamic page column config
│   │   ├── realtime/        # WebSocket realtime data
│   │   ├── global-search/   # Ctrl+K search
│   │   ├── job/             # Scheduled jobs
│   │   ├── package/         # Tenant packages
│   │   ├── theme/           # Theme configuration
│   │   ├── ai-model/        # AI 模型配置 CRUD
│   │   └── ai-usage/        # AI 用量统计
│   └── common/              # Excel import/export
├── core/                    # Framework core
│   ├── crud.ts              # defineCrudModule() factory
│   ├── database.ts          # MySQL connection pool + getDb() (含 SQL 审计钩子)
│   ├── sql-audit.ts         # SQL 错误审计（writeSqlError）
│   ├── router.ts            # Auto-scan route registration
│   └── ...
├── middleware/               # HTTP middleware chain
│   ├── auth.ts              # JWT authentication
│   ├── tenant.ts            # Tenant context injection
│   ├── permission.ts        # RBAC permission check
│   └── ...
├── security/                # Security modules
│   ├── data-scope/          # Data scope (ALL/TENANT/DEPT/SELF/CUSTOM)
│   ├── event-center/        # Security event center + risk rules
│   ├── file-security.ts     # File upload validation
│   ├── rate-limit/          # IP + account multi-dimension rate limiting
│   ├── session/             # Session center + refresh token rotation
│   └── ownership.ts         # Cross-tenant access guard
├── shared/                  # Shared utilities
│   ├── utils/jwt.ts         # JWT sign/verify (camelCase payload)
│   ├── utils/password.ts    # Password hashing
│   ├── utils/snowflake.ts   # Distributed ID generator
│   ├── utils/pagination.ts  # Pagination helpers
│   └── ...
├── services/                # Service layer
├── observability/           # OpenTelemetry + Prometheus metrics
├── outbox/                  # Outbox pattern for event publishing
├── queue/                   # Job worker (polls sys_jobs table)
├── distributed/             # Distributed lock, idempotency, trace
└── scripts/                 # CLI: db init, migrate, backup, openapi
```

### Key Patterns
- **CRUD Factory**: Use `defineCrudModule()` in `core/crud.ts` to generate full CRUD endpoints from a configuration object
- **Data Access**: New business code should use Kysely ORM via `await getDb()` from `core/database.ts`
- **Repository Pattern**: Controller → Service → Repository (Repository handles Kysely queries)
- **Tenant Filtering**: All queries MUST include `tenant_id` filter and `deleted = 0` for soft-delete tables
- **Validation**: Use Zod schemas for request validation
- **API Convention**: Unified response format via `ApiResponse` wrapper
- **SQL Audit**: `core/database.ts` 的 `query`/`queryOne`/`execute` catch 块里自动调用 `writeSqlError()` 记录报错 SQL

## Rust Backend (`bls-rust-server/`) — Port 6002

### Key Commands
```bash
cd bls-rust-server
cargo run               # Start dev server (ports 6002)
cargo build             # Compile
Cargo.exe 路径: C:\Users\18569\.cargo\bin\cargo.exe
```

### Architecture
- **Framework**: Axum + Tokio
- **ORM**: SQLx (runtime checked queries)
- **Auth**: JWT (snake_case payload, serde rename to camelCase for compatibility)
- **WebSocket**: tokio-tungstenite
- **Distributed**: Redis-based lock, rate-limit, idempotency

### Key Modules
- `api/ai/chat.rs` — AI 对话 CRUD (conversations/messages)
- `api/system/` — 全量系统管理模块（user/role/menu/dept/tenant/config/dict/log/...）
- `api/auth.rs` — JWT 登录/刷新
- `db/crud.rs` — CRUD 工厂（类似 Koa 的 defineCrudModule）
- `security/` — 安全模块（data-scope, session, rate-limit, event-center, file-security）
- `distributed/` — 分布式锁、幂等、限流、追踪
- `queue/` — 任务队列轮询

### JWT 注意事项
- Rust 签发 JWT 的 Claims 字段用 serde rename 输出 camelCase：`userId`、`tenantId`、`tokenType`
- Koa 与 Rust 的 JWT 互认（都使用相同 JWT_SECRET）
- bls-ai-service (7201) 也验证此 JWT

## Java Backend (`bls-java-server/`) — Port 8080

### Key Commands
```bash
cd bls-java-server
cp src/main/resources/application.example.yml src/main/resources/application.yml
mvn clean package -DskipTests
java -jar target/bls-java-server-1.0.0.jar
```

### Directory Layout
```
bls-java-server/src/main/java/com/bls/server/
├── BlsJavaServerApplication.java
├── controller/           # REST controllers (mirror Koa API)
│   ├── AuthController.java
│   ├── common/           # Excel import/export
│   └── system/           # User, Role, Menu, Dept, Dict, Config, etc.
├── service/              # Business service layer
├── mapper/               # MyBatis-Plus mapper interfaces
├── entity/               # Entity classes (@TableName)
├── security/             # JWT filter, token provider, TenantContext
├── config/               # Spring config (Security, Redis, Knife4j, WebSocket)
├── core/                 # BaseCrudController, BaseCrudService
├── distributed/          # Lock, rate-limit, idempotent, trace, metrics
├── websocket/            # WebSocket handler
└── common/               # ApiResponse, AppException, GlobalExceptionHandler
```

### API Documentation
- Knife4j (Swagger): http://localhost:8080/doc.html
- Health: http://localhost:8080/internal/health

## AI 微服务 (`bls-ai-service/`) — Port 7201

### Key Commands
```bash
cd bls-ai-service
npm install
cp .env.example .env
npm run dev             # tsx watch src/app.ts
```

### Purpose
所有 AI/LLM 能力统一由该微服务提供，各主后端不重复实现 AI 能力。

### API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ai/chat/completions` | POST | SSE 流式对话（OpenAI 兼容格式） |
| `/api/ai/models` | GET | 获取可用模型列表（优先 DB ai_model_config，fallback 环境变量） |
| `/api/ai/crud/generate` | POST | CRUD 模块生成 |
| `/api/ai/sql/generate` | POST | 自然语言转 SQL |
| `/api/ai/audit/analyze` | POST | 安全审计分析 |
| `/api/ai/config/review` | POST | 配置审查 |
| `/api/ai/ocr/recognize` | POST | 图片文字识别 |
| `/health` | GET | 健康检查 |

### SSE 流式格式
```json
data: {"choices":[{"delta":{"content":"..."}}]}
data: [DONE]
```

### WebSocket AI 流式端点 (`/ws/ai`)
AI 微服务还提供 WebSocket 流式接口（`bls-ai-service/src/ws/stream-handler.ts`），用于 crud/sql/audit/config 四类生成任务：

```
连接: ws(s)://<host>/ws/ai
消息协议（客户端 → 服务端）:
  { "type": "crud"|"sql"|"audit"|"config", "token": "<JWT>", "params": {...} }
  - 首条消息必须带 token 认证（验证 tokenType === 'access'）
消息协议（服务端 → 客户端）:
  { "type": "start" }
  { "type": "chunk", "content": "..." }       // 增量内容
  { "type": "guard_validated", "sql": "...", "original": "...", "tenantIsolated": true }  // 仅 sql 类型
  { "type": "done" }                            // 流结束，随后服务端关闭连接
  { "type": "error", "message": "..." }
权限映射: crud→ai:crud:generate, sql→ai:sql:generate, audit→ai:audit:analyze, config→ai:config:review
超时: 5 分钟无响应自动关闭（code 4000）
```

前端使用 `useAiStream()` hook（`bls-admin/src/hooks/useAiStream.ts`）消费此 WS 流。

### 模型配置
- 优先从数据库 `ai_model_config` 表读取（`factory.ts` 的 `getModelConfigs()`）
- 降级使用 `.env` 的 `OPENAI_API_KEY` 作为 fallback
- 关键 `.env` 变量：`BLS_SERVER_URL=http://localhost:6001`（回查主后端获取配置）

### 认证
- 使用 JWT Bearer token（与主后端共享 JWT_SECRET）
- 所有接口（除 /health）都需要 `jwtAuth()` 中间件
- 无防重放中间件

### 限流
- Redis 限流：`aiPerMinute`（默认 30）、`sqlPerMinute`（默认 10）
- Redis 连接失败时降级

## Event Service (`bls-event-service/`) — Port 7101

### Key Commands
```bash
cd bls-event-service
npm install
cp .env.example .env
npm run dev             # Port 7101
```

### Purpose
- Receives security audit events from the main backends
- Persists operation logs and security alerts
- Uses `INTERNAL_SECRET` for service-to-service authentication
- Independent Koa microservice with its own MySQL connection

## Database Schema

> **Full schema reference**: See `references/database-schema.md` for complete CREATE TABLE statements, column names, types, and seed data. Always consult this reference before writing SQL to avoid column name errors (e.g., `sort_num` NOT `order_num`, `create_time` NOT `created_at`).

All tables defined in `sql/Init.sql`. Key tables:
- `sys_user`, `sys_role`, `sys_menu` — RBAC core
- `sys_role_menu` — Role-menu permission mapping
- `sys_tenant`, `sys_tenant_package` — Multi-tenant management
- `sys_package`, `sys_package_menu` — Tenant package & menu permissions
- `sys_dept` — Department hierarchy
- `sys_dict_type`, `sys_dict_data` — System dictionaries
- `sys_config` — Dynamic system configuration
- `sys_operation_log`, `sys_security_log`, `sys_login_log` — Audit logs
- `sys_ip_blacklist` — IP blacklist
- `sys_sql_audit` — SQL 错误审计（报错 SQL 自动落库）
- `sys_job` — Scheduled job definitions
- `sys_file`, `sys_file_config` — File storage
- `outbox_event` — Outbox pattern events
- `sys_webhook`, `sys_webhook_delivery` — Webhook system
- `sys_page_config`, `sys_page_column_config` — Dynamic page/column configuration
- `ai_model_config` — AI 模型配置（provider/model_id/api_key/base_url/temperature 等）
- `sys_ai_usage` — AI 用量统计（token/cost/elapsed/endpoint 等）
- `ai_conversation`, `ai_conversation_message` — AI 对话持久化
- `sys_migrations` — 数据库迁移版本记录

**Critical rules:**
- All multi-tenant tables have `tenant_id` column
- All soft-delete tables have `deleted` column (0 = active, 1 = deleted)
- `tenant_id = '000000'` = platform super-admin scope
- Default tenant: `000000`, superadmin/123456
- 所有 ID 使用 `varchar(32)` Snowflake ID

## AI 前端流式解析

### 核心文件
- `bls-admin/src/services/ai/module-builder.ts` — `chatCompletions()` 函数，解析 OpenAI 兼容 SSE
- `bls-admin/src/services/ai/chat-provider.ts` — `chatStream()` 函数 + 对话 CRUD
- `bls-admin/src/pages/ai/workbench/index.tsx` — AI 聊天工作台页面

### 解析逻辑
```typescript
// SSE 数据格式
data: {"choices":[{"delta":{"content":"..."}}]}
data: [DONE]

// 解析（module-builder.ts，已修复）
const json = JSON.parse(data);
const delta = json.choices?.[0]?.delta?.content || '';
```

### 鉴权
- `module-builder.ts` 的 `getAuthorization()` 从 localStorage 读取 token，补齐 `Bearer ` 前缀
- `chat-provider.ts` 通过 `tokenStore.getAccessToken()` 获取
- 前端 workbench 页面调用 `chatCompletions` 前确保 token 已写入 localStorage

## Deployment

### Docker (Recommended)
```bash
docker compose --env-file .env.docker up -d --build
```

### Local Development
```bash
# 1. Start infrastructure
docker compose --env-file .env.docker up -d mysql redis minio

# 2. Initialize DB
docker exec bls-mysql mysql -uroot -p kox < sql/Init.sql

# 3. Start backend (Koa)
cd bls-server && npm install && npm run dev

# 4. Start AI service
cd bls-ai-service && npm install && npm run dev

# 5. Start frontend
cd bls-admin && npm install && npm run dev
```

### 本机端口
| Service | Port | Technology |
|---------|------|------------|
| bls-server (Koa) | 6001 | tsx watch |
| bls-rust-server | 6002 | cargo run |
| bls-java-server | 8080 | mvn + java -jar |
| bls-ai-service | 7201 | tsx watch |
| bls-event-service | 7101 | tsx watch |
| bls-admin (dev) | 9000 | umi max dev |
| MySQL | 3306 | Docker |
| Redis | 6379 | Docker |
| MinIO | 9000/9001 | Docker |

### 代理配置（bls-admin/config/proxy.ts）
- `/api/ai/chat/conversations` → Koa/Rust 主后端
- `/api/ai/` 其余 → bls-ai-service (7201)
- `/api/` → 主后端
- `/ws/` → 主后端 WebSocket

### 切换后端
修改 `bls-admin/config/proxy.ts` 的 `/api/` target：
- `http://localhost:6001` — Koa
- `http://localhost:6002` — Rust
- `http://localhost:8080` — Java

## Security Features

| Feature | Implementation |
|---------|---------------|
| JWT Auth | Access + Refresh tokens with rotation and reuse detection |
| RBAC | Role → Menu → Button three-level permission |
| Multi-tenant Isolation | Automatic `tenant_id` injection, cross-tenant access alerts |
| Rate Limiting | IP + account multi-dimension Redis Lua sliding window |
| Replay Protection | Timestamp + Nonce + HMAC signature verification |
| IP Blacklist | Redis instant + DB persistent, auto-ban via event center |
| File Security | Extension/MIME/Magic Number validation, path traversal protection |
| Data Scope | ALL / TENANT / DEPT / DEPT_AND_CHILDREN / SELF / CUSTOM |
| Security Audit | 24 event types, 4 risk levels, full-chain logging |
| SQL Audit | 报错 SQL 自动落库 sys_sql_audit（fire-and-forget） |

## Working Conventions

1. **Never modify master branch structure** — the monorepo must stay intact
2. **Build outputs are gitignored**: `dist/`, `build/`, `target/`, `node_modules/`, `coverage/`
3. **Environment files**: `.env.example` and `.env.docker.example` are committed; `.env`, `.env.docker`, `.env.production` are gitignored
4. **API compatibility**: When adding endpoints to one backend, ensure the other backends can support the same contract
5. **Frontend API calls**: Go through `services/` layer, never call `fetch` directly in components
6. **Koa backend**: New modules use Kysely ORM; existing modules may still use raw SQL
7. **Code style**: Frontend uses Biome for linting/formatting; Koa backend uses TypeScript compiler for type checking
8. **AI 能力统一由 bls-ai-service 提供**，各主后端不重复实现 AI/LLM 能力
9. **umi dev 压缩**：umi 4 默认 compress 中间件会缓冲 SSE，必须在 dev 脚本加 `UMI_DEV_SERVER_COMPRESS=none`
10. **JWT 字段名**：Koa 使用 camelCase（userId/tenantId/tokenType），Rust 通过 serde rename 输出 camelCase，Java 保持一致
