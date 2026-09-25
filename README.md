# BLS-KOX

[![CI](https://github.com/npcxl/BLS-KOX/actions/workflows/ci.yml/badge.svg)](https://github.com/npcxl/BLS-KOX/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Mulan%20PSL%20v2-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](CHANGELOG.md)
[![Koa](https://img.shields.io/badge/Koa-3.x-333)](https://koajs.com/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.3.5-6db33f)](https://spring.io/)
[![Rust](https://img.shields.io/badge/Rust-1.85+-dea584)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![Ant Design Pro](https://img.shields.io/badge/Ant%20Design%20Pro-6-1677ff)](https://pro.ant.design/)

> 多后端并存的开源多租户后台开发框架与管理系统模板。
> **一套前端 + 一套 MySQL + 一套 Redis**，同时支持 **Koa (TypeScript，默认主后端)**、
> **Spring Boot (Java 21)** 与 **Rust (Axum)** 三套后端，API 完全兼容、可随时切换。
> 内置 RBAC、多租户隔离、JWT 会话体系、防重放、限流、安全审计、WebSocket、
> Prometheus Metrics 与 **AI 智能助手**。

🏠 [GitHub](https://github.com/npcxl/BLS-KOX) · [Gitee](https://gitee.com/leheya/bls-kox) · [CNB 原生开发](https://cnb.cool/bls-xl/bls-kox)

---

## 🧠 Memory — 项目开始前存入AI Agent记忆为初始化记忆

本项目把**每个页面的「前端操作 → 后端校验逻辑」**沉淀成了一套 AI 可读的记忆库。
无论是二开、修 bug 还是排查问题，都从这里入手，不要直接翻代码猜：

| 位置 | 内容 |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | **代理规则入口**：先读 `bls-memory/`，再读项目技能；含表结构指引与改动后的同步义务 |
| [`bls-memory/README.md`](./bls-memory/README.md) | **页面索引**、文档模板、版本元信息规范、给 AI 的使用步骤 |
| [`bls-memory/pages/`](./bls-memory/pages) | **一页一档**（27 篇）：前端操作 → service 函数 → HTTP 接口 → 后端 handler 与校验 → 权限码 → 租户隔离 → 防重放/限流规则 → 前端独有校验 → 已知缺陷 → 扩展步骤 |
| [`bls-memory/00-common/`](./bls-memory/00-common) | **跨领域公共文档**（13 篇，见下表） |
| [`bls-memory/CHANGELOG.md`](./bls-memory/CHANGELOG.md) | 文档集变更记录（Keep a Changelog + 文档集 SemVer） |
| [`.codebuddy/memory/MEMORY.md`](./.codebuddy/memory/MEMORY.md) | 跨会话长期记忆：环境/工具坑、项目硬性约定、协作偏好 |

| 公共文档 | 内容 |
|---|---|
| `00-architecture.md` | 模块与端口、Koa 中间件顺序、响应体与错误码、路由自动扫描、CRUD 工厂、命名硬约束 |
| `01-redis.md` | **唯一的 Redis 文档**：连接、key 前缀、全部 key 命名空间与 TTL |
| `02-replay-protection.md` | 防重放（timestamp / nonce / signature / 幂等）模式、校验顺序、规则表 |
| `03-rate-limiting.md` | 限流维度、Lua 算法、规则表 |
| `04-auth-and-permissions.md` | JWT、刷新轮换与复用检测、Session Center、`hasPerm`、租户隔离、数据权限 |
| `05-security-log-and-event-center.md` | 安全事件类型、风险规则、自动处置、IP 封禁 |
| `06-file-and-excel-security.md` | 上传校验链、存储 provider、Excel 导入导出 |
| `07-database.md` | **数据库总入口**：40 张表清单（含归属页面）、命名约定与例外、迁移流程、已知漂移 |
| `08-external-api-and-service-auth.md` | `/api/v1`、`/openapi/v1`（API Key + HMAC）、`/internal`、Swagger、OpenAPI 生成 |
| `09-realtime-websocket.md` | `/ws/realtime` 协议、广播载荷、nginx 升级、前端接入 |
| `10-job-api-and-queue.md` | 任务 API（`/api/system/jobs`）与 `sys_jobs` 队列语义、worker |
| `11-frontend-shell.md` | 构建配置、dev proxy、路由、`app.tsx` 运行时、请求管线、i18n |
| `12-frontend-data-layer.md` | 全部 hooks、`CrudTablePage`、共享组件、`services/*` 全量接口 |

**改动代码后的约定**：同步更新对应文档 → 刷新该文档 H1 下的元信息行
（`Document version` / `Code version` / `Verified commit` / `Last verified`）→ 在
`bls-memory/CHANGELOG.md` 追加条目。新增 Redis key 补 `01-redis.md`；新增表/列补
`07-database.md` 并同步 `sql/Init.sql` + `bls-server/migrations/`。
文档正文使用英文，便于 AI 稳定解析。

---

## ✨ 亮点

- **多后端并存** — Koa / Spring Boot / Rust 三套后端 API 完全兼容，按需选择或共存切换
- **安全内置** — 防重放、多维限流、审计日志、IP 黑名单、风险规则引擎随框架自带
- **多租户原生** — `tenant_id` 服务端自动注入，跨租户访问自动告警，Ownership Guard
- **一行配置生成接口** — Koa `defineCrudConfig()` 由 `fields` 单一字段来源推导完整 CRUD 与校验
- **AI 智能助手** — 独立 AI 微服务，支持自然语言生成 CRUD、SQL 助手、审计分析、配置审查
- **现代全栈 + 一键部署** — React 19 + Ant Design Pro 6，`docker compose up -d` 起全栈

## 📸 预览

![系统截图1](img/1.png)

![系统截图2](img/2.png)

## 🏗 架构

```
                    bls-admin (React 19 + Ant Design Pro 6)
                                  │ HTTP / WS
                                  ▼
                          Nginx (反向代理)
                                  │
        ┌─────────────┬───────────┴────────┬─────────────┐
        ▼             ▼                    ▼             ▼
  bls-server    bls-ai-service     bls-java-server   bls-rust-server
  Koa 3 默认     AI 微服务 :7201     Spring Boot :8080  Axum :6002（可选）
  :7001         SSE / OCR / 用量       （可选）           （可选）
        └─────────────┴────────────────────┴─────────────┘
                                  │
                     MySQL 8.0 · Redis 7 · MinIO / Prometheus
```

> **关键设计**：三套后端共用同一套 MySQL（`sql/Init.sql`）、同一套 Redis、同一套前端代码。
> Nginx 通过 upstream 切换后端，前端零改动；AI 能力通过 `/api/ai/*` 独立提供。

## 🔧 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + Ant Design Pro 6 + UmiJS Max + TypeScript（打包器 utoopack） |
| 后端（默认） | Koa 3 + TypeScript + Kysely + Zod |
| 后端（可选） | Spring Boot 3.3.5 + Java 21 + MyBatis-Plus；Axum 0.8 + SQLx（Rust） |
| 数据 / 缓存 | MySQL 8.0（三端共用）、Redis 7（Session / 限流 / 缓存）、MinIO（对象存储） |
| 部署 / 可观测 | Docker Compose + Nginx；Prometheus Metrics、OpenTelemetry Tracing |

三套后端定位差异与选型建议见 [多后端对比](./docs/backend-comparison.md)。

## 🚀 快速开始

### 方式一：Docker（推荐，零配置）

```bash
git clone https://github.com/npcxl/BLS-KOX.git && cd BLS-KOX
docker compose --env-file .env.docker up -d --build
docker compose ps          # 全部 Up (healthy) 即成功
```

| 服务 | 地址 |
|---|---|
| 管理端 | http://localhost |
| API / 健康检查 | http://localhost/api · http://localhost/api/health |
| MinIO 控制台 | http://localhost:9001 |

### 方式二：本地开发（可看接口文档）

```bash
# 1) 只起基础设施
docker compose --env-file .env.docker up -d mysql redis minio
# 2) 初始化数据库
docker exec bls-mysql mysql -uroot -p"${DB_PASSWORD}" kox < sql/Init.sql
# 3) 后端（Koa）
cd bls-server && npm install && npm run dev      # http://localhost:6001
# 4) 前端（新终端）
cd bls-admin && npm install && npm run dev       # http://localhost:9000
```

- Swagger UI：http://localhost:6001/api/docs ｜ OpenAPI JSON：`/api/openapi.json`
- 生成接口文档：`cd bls-server && npm run openapi`（仅生成）/ `npm run openapi:serve`（预览）

> ⚠️ Docker 部署默认不对外暴露 `/api/docs`，需要看文档请用本地开发模式。
> 更完整的部署、Java 后端、故障排查见 [Docker 部署指南](./docs/docker-deploy.md)。

### 默认账号（**仅本地演示，生产必须改**）

| 项目 | 值 |
|---|---|
| 平台租户 / 账号 | `000000` / `superadmin` · 密码 `123456` |
| 租户管理员 | 租户 `100000` / `admin` · 密码 `123456` |

详见 [SECURITY.md](./SECURITY.md)。

### 体验账号

在线演示环境（无需部署，打开就能用）：

| 项目 | 值 |
|---|---|
| 演示地址 | **<https://admin.xlcig.cn>** |
| 账号 | `admin` |
| 密码 | `123456` |

> ⚠️ 公开演示环境：**请勿修改密码、请勿写入真实或敏感数据**，演示数据可能被定期重置。
> 生产部署请务必修改默认密码，详见 [SECURITY.md](./SECURITY.md)。

## 🔀 切换后端

三套后端 API 完全兼容，改 Nginx upstream 即可；本地开发也可改前端 dev proxy 指向目标端口。

```nginx
upstream bls_server { server bls-server:7001; }      # 默认 Koa
# upstream bls_server { server bls-java-server:8080; }  # Java
# upstream bls_server { server bls-rust-server:7001; }  # Rust（容器内端口 7001）
```

> Docker 切 Java：`docker compose -f docker-compose.yml -f docker-compose.java.yml up -d --build`。
> 切换前必须先 `down`——两套 compose 使用相同的 `container_name`。

## 📁 目录结构

```
BLS-KOX/
├── bls-admin/          # React 前端（三套后端共用）
├── bls-server/         # Koa 3 后端（默认主后端，含 core / middleware / security / queue / outbox）
├── bls-ai-service/     # AI 微服务（SSE 对话、OCR、用量上报、模型 provider）
├── bls-java-server/    # Spring Boot 后端（API 兼容并存）
├── bls-rust-server/    # Axum 后端（API 兼容并存）
├── sql/Init.sql        # 三端共用的表结构与种子数据
├── bls-server/migrations/  # 已部署库的增量迁移脚本
├── deploy/             # Prometheus 告警等部署配置
├── docs/               # 长文档（入口 docs/index.md）
├── bls-memory/         # ★ 页面级 AI 记忆库（见上文「Memory」）
├── docker-compose*.yml # 全栈 / 开发 / Java 编排
└── nginx*.conf         # 反向代理配置
```

## 🛡 能力一览

| 能力 | 实现 |
|---|---|
| 多租户隔离 | `tenant_id` 服务端注入、跨租户访问告警、Ownership Guard |
| RBAC | 角色 → 菜单 → 按钮三级权限，权限码前后端与 SQL 种子一致 |
| JWT 会话 | Access/Refresh Token、Rotation、复用检测、Session Center 强制下线 |
| 泛型 CRUD 工厂 | `defineCrudConfig()` / `defineCrudModule()` 一行生成 list/detail/add/edit/remove/status |
| 动态列配置 | 运行时配置列的可见/可搜/可编辑，无需改代码 |
| 防重放 | Timestamp + Nonce + 可选 HMAC 签名 + 幂等 Key |
| 限流 | IP / 账号 / 用户 / 租户多维 Redis Lua 计数 |
| 安全审计 | 26 种事件类型、4 级风险、风险规则引擎自动封禁 IP / 锁定账户 / 吊销会话 |
| 文件安全 | 扩展名 + MIME + Magic Number 多层校验、路径穿越防护、密钥脱敏 |
| 数据权限 | ALL / TENANT / DEPT / DEPT_AND_CHILDREN / SELF / CUSTOM |
| Excel 导入导出 | 模板下载、批量导入、去重更新、失败明细、分布式锁 |
| 全局搜索 / WebSocket | Ctrl+K 跨模块搜索；看板实时数据推送 |
| 可观测性 | `/api/metrics`（Prometheus）、OpenTelemetry Tracing、结构化日志 |
| 异步与可靠性 | `sys_jobs` 队列 + Worker、Outbox 事务事件、分布式锁、备份/恢复 |

## 📖 文档

📚 **[文档中心 `docs/index.md`](./docs/index.md)** 是全量导航入口。常用几篇：

| 文档 | 说明 |
|---|---|
| [快速开始](./docs/getting-started.md) | 环境要求、安装启动、演示账号 |
| [Docker 部署](./docs/docker-deploy.md) | Compose 一键部署、Koa/Java/Rust 切换、AI 配置、故障排查 |
| [架构设计](./docs/architecture.md) | 请求链路、中间件、多后端总览、AI 服务架构 |
| [Koa 后端](./docs/backend-koa.md) · [Java](./docs/backend-java.md) · [Rust](./bls-rust-server/README.md) | 各后端架构细节 |
| [API 兼容性](./docs/api-compatibility.md) | 多后端 API 规范、返回结构、字段命名一致性 |
| [CRUD 工厂](./docs/crud.md) | `defineCrudConfig` / `defineCrudModule` 完整用法 |
| [安全能力](./docs/security.md) | 防重放、限流、审计、多租户 |
| [部署指南](./docs/deployment.md) · [生产检查清单](./docs/production-checklist.md) | 生产环境落地 |

## 🤝 贡献 · 🗺 路线图 · 📄 许可

- 贡献指南：[CONTRIBUTING.md](./CONTRIBUTING.md)；安全问题请先看 [SECURITY.md](./SECURITY.md)
- 路线图与需求：[GitHub Issues](https://github.com/npcxl/BLS-KOX/issues)（CI/CD、Queue/Worker、Outbox、Backup/Restore、Data Scope、API Versioning、Webhook、File Security、配置中心、分布式能力均已完成）
- 许可：[Mulan PSL v2](http://license.coscl.org.cn/MulanPSL2)
