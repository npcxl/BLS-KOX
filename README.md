# BLS-KOX

[![CI](https://github.com/npcxl/BLS-KOX/actions/workflows/ci.yml/badge.svg)](https://github.com/npcxl/BLS-KOX/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Mulan%20PSL%20v2-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)](https://www.typescriptlang.org/)
[![Koa](https://img.shields.io/badge/Koa-2.x-333)](https://koajs.com/)
[![Ant Design Pro](https://img.shields.io/badge/Ant%20Design%20Pro-5.x-1677ff)](https://pro.ant.design/)

> 基于 Koa + TypeScript 的开源多租户后台开发框架与管理系统模板。
> 内置 RBAC、多租户隔离、JWT 会话体系、防重放、限流、安全审计、WebSocket、Prometheus Metrics。

## ✨ Why BLS-KOX

- **安全内置，而非事后追加** — 防重放、限流、审计日志随框架自带
- **多租户原生支持** — tenant_id 自动注入，跨租户访问自动告警
- **一行配置生成接口** — `defineCrudModule()` 生成完整的 list/add/edit/remove/status
- **现代化 TypeScript 全栈** — Koa + Kysely ORM + Zod + React 18 + Ant Design Pro 5
- **Docker 一键部署** — `docker compose up -d`

**适合**：学习后端架构 · 快速搭建管理后台 · SaaS 原型开发 · 权限系统参考 · 二次开发

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
| 前端 | React 18 + Ant Design Pro 5 + Umi 4 + TypeScript |
| 后端 | Koa 2 + TypeScript + Kysely ORM + Zod |
| 数据库 | MySQL 8.0 |
| 缓存 | Redis 7 |
| 部署 | Docker Compose + Nginx |

## 🏃 Quick Start

### 环境要求
- Node.js ≥ 20
- MySQL 8.0
- Redis 7

```bash
# 1. 克隆
git clone https://github.com/npcxl/BLS-KOX.git && cd BLS-KOX

# 2. 启动 MySQL + Redis（Docker）
docker compose up -d mysql redis

# 3. 后端
cd bls-server
cp .env.example .env
npm install
npx tsx src/scripts/seed.ts   # 初始化数据（可选）
npm run dev                    # http://localhost:6001

# 4. 前端（新终端）
cd ../bls-admin
npm install
npm start                      # http://localhost:8000
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
| [快速开始](./docs/getting-started.md) | 环境要求、安装、启动 |
| [架构设计](./docs/architecture.md) | 请求链路、中间件 |
| [多租户](./docs/multi-tenant.md) | 数据隔离、权限守卫 |
| [认证体系](./docs/auth.md) | Token、Session Center |
| [RBAC 权限](./docs/rbac.md) | 角色-菜单-按钮 |
| [CRUD 工厂](./docs/crud.md) | 一行配置生成接口 |
| [安全能力](./docs/security.md) | 防重放、限流、审计 |
| [可观测性](./docs/observability.md) | Metrics、告警 |
| [部署指南](./docs/deployment.md) | Docker、生产环境 |

## 🗺 Roadmap

- [x] CI/CD
- [x] Prometheus Metrics
- [ ] Queue / Worker
- [ ] Outbox Pattern
- [ ] API Versioning
- [ ] Webhook

详见 [docs/roadmap.md](./docs/roadmap.md)。

## 🤝 Contributing

欢迎贡献！请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 📄 License

本项目基于 [Mulan PSL v2](http://license.coscl.org.cn/MulanPSL2) 开源。
