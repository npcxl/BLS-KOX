# BLS-KOX

[![CI](https://github.com/npcxl/BLS-KOX/actions/workflows/ci.yml/badge.svg)](https://github.com/npcxl/BLS-KOX/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Mulan%20PSL%20v2-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178c6)](https://www.typescriptlang.org/)
[![Koa](https://img.shields.io/badge/Koa-3.x-333)](https://koajs.com/)
[![Ant Design Pro](https://img.shields.io/badge/Ant%20Design%20Pro-6.x-1677ff)](https://pro.ant.design/)
[![React](https://img.shields.io/badge/React-19.x-61dafb)](https://react.dev/)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](CHANGELOG.md)

> 基于 Koa + TypeScript 的开源多租户后台开发框架与管理系统模板。
> 内置 RBAC、多租户隔离、JWT 会话体系、防重放、限流、安全审计、WebSocket、Prometheus Metrics。

## ✨ Why BLS-KOX

- **安全内置，而非事后追加** — 防重放、限流、审计日志随框架自带
- **多租户原生支持** — tenant_id 自动注入，跨租户访问自动告警
- **一行配置生成接口** — `defineCrudModule()` 生成完整的 list/add/edit/remove/status
- **现代化 TypeScript 全栈** — Koa + Kysely ORM + Zod + React 19 + Ant Design Pro 6
- **Docker 一键部署** — `docker compose up -d`

**适合**：学习后端架构 · 快速搭建管理后台 · SaaS 原型开发 · 权限系统参考 · 二次开发

## 📸 预览

![系统截图1](img/1.png)

![系统截图2](img/2.png)

## 🏗 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     bls-admin (React 19)                     │
│            Ant Design Pro 6 · Umi 4 · TypeScript             │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP/WS
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                       Nginx (反向代理)                        │
│              static files · /api proxy · gzip                │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                   bls-server (Koa 3)                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                 Middleware Layer                      │   │
│  │  ┌──────────┬──────────┬──────────┬──────────────┐   │   │
│  │  │  JWT     │  Tenant  │  RBAC    │  Rate Limit  │   │   │
│  │  │  Auth    │  Inject  │  hasPerm │  Sliding Win │   │   │
│  │  └──────────┴──────────┴──────────┴──────────────┘   │   │
│  │  ┌──────────┬──────────┬──────────────┐              │   │
│  │  │  Replay  │  IP      │  Data Scope  │              │   │
│  │  │  Protect │  Block   │  ALL/TENANT/ │              │   │
│  │  │  Nonce+  │  Redis+  │  DEPT/SELF   │              │   │
│  │  │  HMAC    │  DB      │              │              │   │
│  │  └──────────┴──────────┴──────────────┘              │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               Service / CRUD Factory                  │   │
│  │   defineCrudModule() → list/add/edit/remove/status   │   │
│  │   Kysely ORM · Zod Validation · Auto API Scan        │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│  ┌──────────┬──────────┬──────────┬─────────────────────┐   │
│  │  MySQL   │  Redis   │  MinIO   │  Prometheus         │   │
│  │  8.0     │  7       │  (可选)   │  /api/metrics       │   │
│  └──────────┴──────────┴──────────┴─────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│  Security     │  │  Audit        │  │  WebSocket    │
│  Center       │  │  Logs         │  │  Real-time    │
│  · 风险规则引擎 │  │  · 登录日志    │  │  Push         │
│  · IP 封禁    │  │  · 操作审计    │  │               │
│  · 会话中心    │  │  · 安全日志    │  │               │
└───────────────┘  └───────────────┘  └───────────────┘
```

## 🛡️ Security

| 能力 | 实现 |
|------|------|
| 安全中心 Dashboard | 登录失败趋势、高频 IP、风险账号、防重放/限流拦截统计 |
| 防重放攻击 | Timestamp + Nonce + HMAC 签名验证 |
| 频率限制 | IP + 账号多维度 Redis Lua 滑动窗口 |
| IP 黑名单 | Redis 即时生效 + DB 持久化，事件中心自动封禁 |
| 风险规则引擎 | 6 条规则：爆破检测、Token 复用、跨租户访问、签名无效、重放攻击、高频限流 |
| 会话中心 | Session Index 管理、Refresh Token Rotation、复用检测 |
| 文件安全 | 扩展名/MIME/Magic Number 多层校验、路径穿越防护、敏感字段脱敏 |
| 数据权限 | ALL / TENANT / DEPT / DEPT_AND_CHILDREN / SELF / CUSTOM 六级范围 |
| 安全审计 | 24 种事件类型、4 级风险等级、全链路日志 |

## 🚀 Features

| 模块 | 说明 |
|------|------|
| 多租户隔离 | 自动 tenant_id 注入，跨租户访问告警，Ownership Guard |
| RBAC 权限 | 角色 → 菜单 → 按钮三级权限 |
| JWT 会话体系 | Access/Refresh Token，Rotation，Reuse Detection，Session Center |
| 泛型 CRUD 工厂 | `defineCrudModule()` 一行生成完整 CRUD 接口 |
| 动态列配置 | 运行时配置列可见/可搜/可编辑，无需改代码 |
| 防重放攻击 | Timestamp + Nonce + HMAC + 幂等 Key |
| 频率限制 | IP + 账号多维度 Redis 滑动窗口限流 |
| 安全审计 | 登录/权限/重放/签名全链路日志 |
| 全局搜索 | Ctrl+K 跨模块模糊搜索 |
| Excel 导入导出 | 模板下载、批量导入、去重更新、失败明细 |
| WebSocket | 看板数据实时推送 |
| Prometheus Metrics | `/api/metrics`，HTTP/Security/DB/Redis/WS 全量指标 |
| Docker 部署 | `docker compose up -d` 一键启动 |

## 🛠 Tech Stack

| 层 | 技术 |
|----|------|
| 前端 | React 19 + Ant Design Pro 6 + Umi 4 + TypeScript |
| 后端 | Koa 3 + TypeScript + Kysely ORM + Zod |
| 数据库 | MySQL 8.0 |
| 缓存 | Redis 7 |
| 部署 | Docker Compose + Nginx |

## 🔧 环境要求

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | ≥ 22.0.0 | 运行时 |
| MySQL | 8.0 | 数据库 |
| Redis | 7.0 | 缓存 / 限流 / Session |
| Docker | 20.10+ | 可选，一键部署使用 |

## 🏃 Quick Start

### 方式一：Docker 一键部署（推荐）

```bash
git clone https://github.com/npcxl/BLS-KOX.git && cd BLS-KOX
cp .env.example .env
# 编辑 .env 修改所有 CHANGE_TO_* 值为强密码
docker compose up -d --build
docker compose ps
```

启动成功后访问：
- **管理端**：http://localhost
- **API**：http://localhost/api
- **健康检查**：http://localhost/api/health

### 方式二：本地开发

```bash
# 1. 启动 MySQL + Redis（使用 Docker）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mysql redis

# 2. 后端
cd bls-server
cp .env.example .env
npm install
npm run db:migrate up
npm run dev                                    # http://localhost:6001

# 3. 前端（新终端）
cd ../bls-admin
npm install
npm start                                      # http://localhost:9000
```

## 🔑 默认账号

| 项目 | 值 |
|------|-----|
| 默认租户 | `000000` |
| 默认账号 | `superadmin` |
| 默认密码 | `123456` |
| 租户管理员 | `admin / 123456`（租户 `100000`） |

> ⚠️ **该账号仅适用于本地演示。生产部署前必须立即修改密码！** 详见 [SECURITY.md](./SECURITY.md)。

### 一键运行成功标志

Docker 部署成功后，执行 `docker compose ps` 应看到 4 个服务均为 `Up` (healthy)：

```
NAME                STATUS
bls-kox-admin-1     Up (healthy)
bls-kox-nginx-1     Up
bls-kox-server-1    Up (healthy)
bls-kox-mysql-1     Up (healthy)
bls-kox-redis-1     Up (healthy)
```

## 📁 Project Structure

```
BLS-KOX/
├── bls-server/              # Koa + TypeScript 后端
│   ├── src/
│   │   ├── api/             # 业务接口（自动扫描注册）
│   │   ├── core/            # CRUD 工厂、数据库、审计、日志
│   │   ├── middleware/      # 认证/权限/租户/HTTP Metrics
│   │   ├── middlewares/     # 防重放中间件
│   │   ├── security/        # Ownership Guard、Session Center、限流
│   │   ├── shared/          # JWT、Redis、Snowflake、工具
│   │   └── observability/   # Prometheus 指标
│   └── sql/                 # 数据库初始化
├── bls-admin/               # React + Ant Design Pro 前端
│   └── src/
│       ├── components/      # CrudTablePage、全局搜索等
│       ├── hooks/           # usePageConfig、useCrudTable 等
│       └── pages/           # 各业务页面
├── deploy/                  # Prometheus 告警规则等
├── docker-compose.yml       # 全栈编排
└── docs/                    # 详细文档
```

## 📖 Documentation

| 文档 | 说明 |
|------|------|
| [快速开始](./docs/getting-started.md) | 环境要求、安装、启动、演示账号 |
| [架构设计](./docs/architecture.md) | 请求链路、中间件 |
| [多租户](./docs/multi-tenant.md) | 数据隔离、权限守卫 |
| [认证体系](./docs/auth.md) | Token、Session Center、时序图 |
| [RBAC 权限](./docs/rbac.md) | 角色-菜单-按钮 |
| [CRUD 工厂](./docs/crud.md) | 一行配置生成接口 |
| [安全能力](./docs/security.md) | 防重放、限流、审计 |
| [可观测性](./docs/observability.md) | Metrics、告警 |
| [API 版本化](./docs/api-versioning.md) | 路由前缀、OpenAPI、Internal |
| [部署指南](./docs/deployment.md) | Docker、生产环境 |

## 🗺 Roadmap

- [x] CI/CD
- [x] Prometheus Metrics
- [x] Queue / Worker
- [x] Outbox Pattern
- [x] Backup / Restore
- [x] Data Scope
- [x] API Versioning
- [x] Webhook
- [x] File Security
- [x] Configuration Center

路线图请关注 [GitHub Issues](https://github.com/npcxl/BLS-KOX/issues)。

## 🤝 Contributing

欢迎贡献！请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 📄 License

本项目基于 [Mulan PSL v2](http://license.coscl.org.cn/MulanPSL2) 开源。
