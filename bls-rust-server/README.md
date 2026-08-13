# bls-rust-server

`bls-server` 的 Rust 移植版，是一个多租户 SaaS 后端服务。与 Koa（`bls-server`）和 Java（`bls-java-server`）共享同一套 API 契约，复用同一套 MySQL 数据库与 Redis，可与前端 `bls-admin` 无缝对接。

## 技术栈

- **语言/运行时**：Rust 1.85+（edition 2024）、Tokio、Axum 0.8
- **数据库**：SQLx（MySQL 8.0）
- **缓存**：Redis（`redis` crate，tokio 异步）
- **认证**：JWT（`jsonwebtoken`）+ Argon2id / MD5 密码验证
- **可观测**：Prometheus metrics、`tracing` 日志
- **其他**：Webhook / 队列 / Outbox 事件 / 限流 / RBAC / Data Scope / 文件安全

## 快速开始

```powershell
Copy-Item .env.example .env
# 编辑 .env，配置 MySQL、Redis、JWT 等连接信息
cargo run
```

服务默认监听 `0.0.0.0:6002`（可通过 `APP_PORT` / `PORT` 覆盖）。

## 构建与测试

```powershell
cargo check          # 类型检查
cargo test           # 运行测试
cargo fmt --all      # 格式化代码
cargo build --release # 生产构建（LTO + 单 codegen unit）
```

## 端口

- 本地开发：`6002`
- Docker 容器内：`7001`（见 `Dockerfile` 的 `APP_PORT`）

## 目录结构

```
src/
├── api/               # 路由与处理器
│   ├── auth.rs        # 登录 / 刷新 / 登出 / 用户信息
│   ├── ai/            # AI 对话
│   ├── common/        # Excel 导入导出
│   └── system/        # 系统管理（22 个模块）
├── auth/              # JWT 与密码校验
├── db/                # SQLx 连接池与查询工具
├── distributed/       # 分布式能力（锁、限流、幂等、追踪）
├── middleware/        # 中间件（API 版本、鉴权、限流、防重放等）
├── observability/     # Prometheus metrics
├── outbox/            # Outbox 事件发布
├── queue/             # 任务队列与 worker
├── security/          # 数据权限、事件中心、文件安全、会话、限流、所有权
├── services/          # 业务服务层
├── utils/             # 工具函数（雪花 ID、菜单树、签名等）
├── api_response.rs    # 统一响应封装
├── config.rs          # 环境变量配置加载
├── error.rs           # 错误类型
├── state.rs           # 应用共享状态
├── lib.rs             # 路由组装与 App 构建
└── main.rs            # 入口（启动 worker / outbox publisher）
```

## API 路径

服务对外暴露以下前缀（在 `lib.rs` 中组装）：

- `/api/*` — 主 API
- `/api/v1/*` — 版本化 API（同一套路由）
- `/openapi/v1/*` — OpenAPI 外部调用（独立鉴权）
- `/internal/*` — 内部服务端点（健康检查 / 指标）
- `/ws/realtime` — WebSocket 实时数据

健康检查与文档：

- `GET /api/health` / `GET /api/ready`
- `GET /api/metrics` — Prometheus 指标
- `GET /api/docs` — Swagger UI
- `GET /api/openapi.json` — OpenAPI 描述

## 功能模块

- **认证**：`/api/auth/login`、`/api/auth/refresh`、`/api/auth/logout`、`/api/auth/profile`
- **系统管理**：user、role、menu、dept、dict、config、tenant、package、theme、log、job、storage、webhook、page-config、global-search、dashboard、security、ai-model、ai-usage
- **AI 对话**：`/api/ai/chat/conversations`
- **发布中心**：`/api/ops/releases`（含发布流程、回滚、审批）
- **Excel 导入导出**：`/api/common/excel/export`、`/api/common/excel/template`、`/api/common/excel/import`
- **全局搜索**：`/api/system/global-search`（重建索引等）
- **会话管理**：`/api/system/user/sessions/:userId`、`/api/system/user/kick`

## Storage Provider

文件存储支持以下 Provider：

- `local`
- `minio`
- `aws_s3`
- `aliyun_oss`
- `tencent_cos`
- `qiniu_kodo`
- `huawei_obs`

## 环境变量

参考 `.env.example`，主要配置项：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `APP_HOST` / `APP_PORT` | 监听地址与端口 | `0.0.0.0` / `6002` |
| `NODE_ENV` | 运行环境 | `development` |
| `CORS_ORIGINS` | CORS 白名单（逗号分隔） | `*` |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | MySQL 连接 | `127.0.0.1` / `3306` / `root` / 空 / `bls` |
| `DB_CONNECTION_LIMIT` | 数据库连接池大小 | `10` |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_ENABLED` | Redis 连接 | `127.0.0.1` / `6379` / 空 / `true` |
| `JWT_SECRET` / `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | JWT 密钥与过期时间 | 占位 / `15m` / `7d` |
| `REPLAY_ENABLED` / `API_SIGN_SECRET` | 防重放开关与签名密钥 | `true` / 空 |
| `INTERNAL_SECRET` | 内部服务鉴权密钥 | 空 |
| `EVENT_SERVICE_URL` | 事件服务地址（可选） | 空 |
| `WS_ENABLED` / `WS_PATH` | WebSocket 开关与路径 | `true` / `/ws/realtime` |
| `UPLOAD_DIR` | 文件上传目录 | `./uploads` |

> 生产环境（`NODE_ENV=production`）强制校验：`JWT_SECRET`、`INTERNAL_SECRET` 必须配置，`DB_PASSWORD` 不允许使用 `CHANGE_TO_` 占位符。

## 与 Koa / Java 后端的关系

本项目是 `bls-server`（Koa TypeScript）的 Rust 移植版，目标是与 `bls-java-server`（Spring Boot）一样，保持 **API 兼容**——前端代码无需任何修改即可切换后端。三个后端共享同一份 MySQL schema（`sql/Init.sql`）与 Redis。
