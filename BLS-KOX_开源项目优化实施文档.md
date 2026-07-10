# BLS-KOX 开源项目优化实施文档

> 项目：BLS-KOX  
> 仓库：npcxl/BLS-KOX  
> 项目方向：开源后台开发框架 / 多租户管理系统模板  
> 技术栈：Koa + TypeScript + MySQL + Kysely + Redis + React + Ant Design Pro  
> 文档目标：将当前项目从“企业内部重型平台建设思路”调整为“高质量、易理解、易运行、易扩展、易贡献的开源项目”。

---

# 1. 项目重新定位

## 1.1 推荐项目定位

建议将项目定位调整为：

> BLS-KOX 是一个基于 Koa + TypeScript 的开源多租户后台开发框架与管理系统模板，内置 RBAC、多租户隔离、JWT 会话体系、防重放、限流、安全审计、WebSocket、可观测性等常用能力，适合学习、二次开发和快速搭建管理后台。

关键词：

```text
开源
后台开发框架
管理系统模板
多租户
RBAC
安全增强
快速开发
可扩展
```

不建议继续以：

```text
企业级
大型 SaaS 基础平台
生产级安全中心
企业数字化底座
```

作为项目最核心定位。

这些能力可以作为：

```text
Advanced Features
Production Guide
Roadmap
```

而不是开源项目的基础门槛。

---

# 2. 开源项目核心目标

后续优化优先围绕以下目标：

```text
能看懂
↓
能跑起来
↓
能改
↓
能扩展
↓
能贡献
↓
能持续发布
```

对应六个核心指标：

| 方向 | 目标 |
|---|---|
| 易理解 | README 清晰，架构说明完整 |
| 易运行 | 5～10 分钟完成本地启动 |
| 易开发 | CRUD、权限、多租户有明确示例 |
| 易扩展 | 模块边界清楚，扩展方式明确 |
| 易贡献 | CONTRIBUTING、Issue、PR 模板齐全 |
| 易维护 | CI、Release、CHANGELOG、Roadmap 完整 |

---

# 3. 当前最优先问题

## OS-P0-01：修复 License 信息不一致

当前仓库真实 LICENSE：

```text
Mulan PSL v2
木兰宽松许可证，第2版
```

README 中 License Badge 目前显示 MIT。

必须统一。

建议 README Badge 改为：

```text
Mulan PSL v2
```

并在 README License 部分明确：

```text
本项目基于 Mulan PSL v2 开源。
```

优先级：

```text
P0
```

---

## OS-P0-02：修复 CI

当前 GitHub Actions CI 已明确失败。

CI 当前流程：

```text
npm ci
↓
npm run lint
↓
npm test
↓
npm run build
```

必须确保：

```text
master 最新提交 CI Green
```

禁止以下做法：

```text
|| true
continue-on-error
关闭 strict
删除失败测试
跳过 lint
跳过 build
```

CI 是开源项目的最高优先级基础设施之一。

优先级：

```text
P0
```

---

## OS-P0-03：README 重构

当前 README 内容过长，并混入大量内部技术文档。

建议首页 README 控制在：

```text
200～400 行
```

详细内容拆分至：

```text
docs/
```

---

# 4. README 推荐结构

建议新的 README 结构：

```text
# BLS-KOX

一句话定位

项目截图 / Demo

## Why BLS-KOX

## Features

## Tech Stack

## Quick Start

## Default Account / Demo Data

## Architecture

## Directory Structure

## Core Concepts

## Documentation

## Roadmap

## Contributing

## Community

## License
```

---

## 4.1 README 首屏推荐文案

建议：

```text
# BLS-KOX

BLS-KOX 是一个基于 Koa + TypeScript 的开源多租户后台开发框架与管理系统模板。

内置：

- 多租户隔离
- RBAC 权限控制
- JWT Access / Refresh Token
- Session Center
- 防重放与幂等
- Redis 多维度限流
- 安全审计
- WebSocket
- Prometheus Metrics
- Docker 部署
- GitHub Actions CI

适合：

- 学习 Koa + TypeScript 后端架构
- 快速搭建管理后台
- 多租户 SaaS 原型开发
- 权限系统参考
- 安全中间件设计参考
- 二次开发
```

---

# 5. 文档体系重构

建议目录：

```text
docs/
├── getting-started.md
├── architecture.md
├── project-structure.md
├── configuration.md
├── database.md
├── multi-tenant.md
├── auth.md
├── session-center.md
├── rbac.md
├── crud.md
├── security.md
├── replay-protection.md
├── rate-limit.md
├── websocket.md
├── observability.md
├── deployment.md
├── troubleshooting.md
└── roadmap.md
```

---

## 5.1 getting-started.md

必须包含：

```text
环境要求
Node.js 版本
MySQL 版本
Redis 版本
安装依赖
.env 配置
数据库初始化
启动后端
启动前端
访问地址
默认账号
常见错误
```

目标：

```text
新用户 10 分钟内跑起来
```

---

## 5.2 architecture.md

建议说明：

```text
HTTP Request
↓
Request Context
↓
Tenant Middleware
↓
Replay Protection
↓
Rate Limit
↓
Auth
↓
RBAC
↓
Service
↓
Database / Redis
↓
Audit / Metrics
```

并配一张架构图。

---

## 5.3 multi-tenant.md

重点讲：

```text
tenant_id 如何获取
Request Context 如何保存 tenantId
CRUD 如何自动注入 tenant_id
跨租户访问如何防护
Ownership Guard 如何工作
开发自定义 API 时如何保证租户隔离
```

---

## 5.4 auth.md

讲清：

```text
Access Token
Refresh Token
Access Session
Refresh Session
Refresh Rotation
Refresh Reuse Detection
Logout
Password Change
User Disabled
multiLogin=false
```

建议提供完整时序图。

---

## 5.5 observability.md

内容：

```text
prom-client
/api/metrics
HTTP Metrics
Security Metrics
DB Metrics
Redis Metrics
Session Gauge
WebSocket Gauge
Alert Rules
Prometheus 示例配置
```

注意：

```text
高级部署配置放文档
不要强制要求所有用户启动 Prometheus
```

---

# 6. Quick Start 优化

推荐目标：

```text
git clone
↓
cp .env.example .env
↓
docker compose up -d mysql redis
↓
npm install
↓
npm run db:init
↓
npm run dev
```

最终最好支持：

```text
docker compose up -d
```

但这属于 P1，不需要阻塞项目开源。

---

# 7. Demo 与示例数据

一个开源后台项目非常需要：

```text
Demo Account
Demo Data
Seed Script
```

建议增加：

```text
bls-server/src/scripts/seed.ts
```

至少创建：

```text
默认租户
管理员用户
普通用户
角色
菜单
权限
示例部门
示例数据
```

README 中明确：

```text
username: admin
password: 请通过环境变量初始化或首次启动生成
```

不要在仓库写死真实密码。

---

# 8. CONTRIBUTING.md

建议新增：

```text
CONTRIBUTING.md
```

推荐结构：

```text
# Contributing

## Development Setup

## Branch Naming

feature/xxx
fix/xxx
docs/xxx
refactor/xxx

## Commit Convention

feat:
fix:
docs:
refactor:
test:
chore:

## Pull Request

1. lint 通过
2. test 通过
3. build 通过
4. 描述修改原因
5. 说明是否有 Breaking Change

## Code Style

## Testing Requirements

## Security Issues
```

---

# 9. Issue Template

建议：

```text
.github/
└── ISSUE_TEMPLATE/
    ├── bug_report.yml
    ├── feature_request.yml
    └── config.yml
```

Bug Report 字段：

```text
问题描述
复现步骤
预期行为
实际行为
环境
Node.js
MySQL
Redis
Browser
Logs
```

---

# 10. PR Template

新增：

```text
.github/pull_request_template.md
```

建议内容：

```text
## What

## Why

## Changes

## Test

- [ ] npm run lint
- [ ] npm test
- [ ] npm run build

## Breaking Changes

## Screenshots
```

---

# 11. CHANGELOG 与 Release

建议新增：

```text
CHANGELOG.md
```

版本建议：

```text
v0.1.0
v0.2.0
v0.3.0
v1.0.0
```

采用 Semantic Versioning：

```text
MAJOR.MINOR.PATCH
```

建议 Release Note 结构：

```text
Features
Fixes
Security
Breaking Changes
Documentation
Upgrade Notes
```

---

# 12. Roadmap 重构

原路线：

```text
P5 Observability
P6 Queue / Worker
P7 Outbox
P8 Migration / Backup / DR
P9 Data Scope
P10 Security Center
P11 API Versioning
P12 Webhook
P13 File Security
P14 Configuration Center
```

建议拆成两条路线。

---

## 12.1 Open Source Roadmap

```text
OS1 Project Positioning
OS2 README
OS3 Documentation
OS4 Quick Start
OS5 Demo / Seed
OS6 Contribution Guide
OS7 Issue / PR Template
OS8 Stable CI
OS9 Release
OS10 Community
```

---

## 12.2 Technical Roadmap

```text
T1 Observability
T2 Queue / Worker
T3 Outbox Pattern
T4 Data Scope
T5 API Versioning
T6 Webhook
T7 File Security
T8 Configuration Center
```

以下内容改成可选高级路线：

```text
Backup / DR
Security Center
Large-scale Deployment
HA
Multi-region
```

---

# 13. P5 Observability 开源版验收标准

调整后的 P5 验收标准：

## 必须

```text
✅ prom-client
✅ /api/metrics
✅ HTTP Metrics
✅ Security Metrics
✅ DB Metrics
✅ Redis Metrics
✅ WebSocket Metrics
✅ Alert Rule 示例
✅ 基础测试
✅ CI 通过
✅ 文档
```

## 不阻塞完成

```text
Grafana Dashboard
Alertmanager
Prometheus Docker Service
Session Gauge 超大规模优化
完整 Integration Test Matrix
OpenTelemetry Trace
```

这些列入：

```text
Roadmap / Advanced
```

---

# 14. CI 优化

当前 CI 保持：

```text
npm ci
npm run lint
npm test
npm run build
```

推荐后续增加：

```text
Node.js 20
Node.js 22
```

矩阵测试。

但开源初期可以先只保留：

```text
Node.js 22
```

确保稳定。

---

## 14.1 CI 必须满足

```text
push master
pull_request
```

同时运行。

建议后续增加：

```text
Dependabot
CodeQL
Dependency Review
```

这些可以作为 P2。

---

# 15. Security Policy

建议增加：

```text
SECURITY.md
```

内容：

```text
支持版本
漏洞报告方式
不要公开提交高危漏洞 Issue
响应时间说明
安全更新流程
```

开源项目有：

```text
Replay Protection
Rate Limit
Security Audit
Session Center
```

因此 SECURITY.md 很有必要。

---

# 16. Code of Conduct

建议增加：

```text
CODE_OF_CONDUCT.md
```

开源社区初期可以使用 Contributor Covenant。

---

# 17. 示例目录结构

推荐最终仓库：

```text
BLS-KOX/
├── README.md
├── LICENSE
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CODE_OF_CONDUCT.md
├── docker-compose.yml
├── docs/
│   ├── getting-started.md
│   ├── architecture.md
│   ├── multi-tenant.md
│   ├── auth.md
│   ├── rbac.md
│   ├── crud.md
│   ├── security.md
│   ├── observability.md
│   └── deployment.md
├── deploy/
│   └── prometheus/
├── bls-server/
└── bls-admin/
```

---

# 18. 推荐开发优先级

## 第一阶段：立即处理

```text
1. 修 CI
2. 修 README License Badge
3. README 重构
4. Quick Start
5. .env.example 检查
6. 默认初始化流程
```

---

## 第二阶段：开源基础建设

```text
7. CONTRIBUTING.md
8. SECURITY.md
9. Issue Template
10. PR Template
11. CHANGELOG.md
12. docs/ 拆分
```

---

## 第三阶段：提升体验

```text
13. Seed Data
14. Demo
15. Architecture Diagram
16. CRUD 示例
17. 多租户示例
18. Auth 时序图
```

---

## 第四阶段：技术功能迭代

```text
19. Queue / Worker
20. Outbox
21. Data Scope
22. API Versioning
23. Webhook
24. File Security
25. Config Center
```

---

# 19. 不建议当前优先投入的内容

暂时不要优先投入：

```text
多机房 DR
企业级安全运营中心
复杂 SRE 平台
超大规模 Redis Session 统计
多 Region
复杂 HA
大型组织治理
完整 SOC
```

除非有真实用户需求。

---

# 20. 执行任务建议

建议下一轮 按下面顺序执行。

## Step 1：CI Repair

```text
修复 master CI
确保：
npm ci
npm run lint
npm test
npm run build
全部成功
```

---

## Step 2：README Refactor

要求：

```text
1. 项目定位改为开源开发框架 / 管理系统模板。
2. 修正 LICENSE Badge。
3. README 控制在首页可读范围。
4. 技术细节拆到 docs/。
5. 增加 Quick Start。
6. 增加 Roadmap。
7. 增加 Contributing 链接。
```

---

## Step 3：Open Source Files

新增：

```text
CONTRIBUTING.md
SECURITY.md
CHANGELOG.md
.github/ISSUE_TEMPLATE/*
.github/pull_request_template.md
```

---

## Step 4：Docs

新增：

```text
docs/getting-started.md
docs/architecture.md
docs/multi-tenant.md
docs/auth.md
docs/rbac.md
docs/crud.md
docs/security.md
docs/observability.md
docs/deployment.md
```

---

# 21. 开源项目最终验收标准

## Repository

- [ ] README 清晰。
- [ ] License 一致。
- [ ] CI Green。
- [ ] Quick Start 可运行。
- [ ] `.env.example` 完整。
- [ ] Docker 文档清晰。

## Documentation

- [ ] Getting Started。
- [ ] Architecture。
- [ ] Multi-Tenant。
- [ ] Auth。
- [ ] RBAC。
- [ ] CRUD。
- [ ] Security。
- [ ] Observability。
- [ ] Deployment。

## Community

- [ ] CONTRIBUTING。
- [ ] SECURITY。
- [ ] Issue Template。
- [ ] PR Template。
- [ ] CHANGELOG。

## Development

- [ ] lint。
- [ ] test。
- [ ] build。
- [ ] 核心模块示例。
- [ ] Demo Data / Seed。

---

# 22. 最终方向

BLS-KOX 后续建议围绕：

```text
做一个好用的开源项目
而不是无限堆企业功能
```

核心优先级：

```text
项目体验
>
文档
>
可运行性
>
可扩展性
>
社区贡献体验
>
高级功能数量
```

推荐最终定位：

> BLS-KOX 是一个现代化的 Koa + TypeScript 开源后台开发框架与多租户管理系统模板，强调清晰架构、安全能力、快速开发与良好的二次开发体验。

---

# 23. 当前行动建议

当前最合理顺序：

```text
CI Repair
↓
P5 完成
↓
README / License
↓
Open Source 基础文件
↓
Docs
↓
Seed / Demo
↓
Release v0.1.0
↓
再进入 Queue / Worker
```

建议不要立即继续 P6。

先让项目具备：

```text
能安装
能启动
能构建
能阅读
能贡献
```

再继续扩展技术能力。
