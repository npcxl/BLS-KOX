# bls-server

Koa + TypeScript + MySQL + JWT 多租户 SaaS 后端框架，适配 Ant Design Pro。

## 特性

- 共享库共享表，`tenant_id` 行级隔离
- `tenant_id = 0` 平台超级管理员
- RBAC：用户 -> 角色 -> 菜单/权限标识
- Skill 按钮权限，例如 `system:tenant:add`
- JWT 鉴权与当前用户上下文
- 统一响应、异常处理、参数校验
- Controller / Service / Repository / Model 分层，方便后期模块复用

## 快速开始

```bash
cd bls-server
npm install
copy .env.example .env
npm run db:init
npm run dev
```

默认超级管理员：

- 用户名：`admin`
- 密码：`admin123`

## 目录结构

```text
src
├─ app.ts                 # 应用入口
├─ config                 # 环境配置
├─ core                   # 数据库、路由、错误、响应等基础能力
├─ middleware             # JWT、租户、权限、错误中间件
├─ modules               # 业务模块
│  ├─ auth
│  └─ system
│     ├─ tenant
│     ├─ user
│     ├─ role
│     └─ menu
├─ scripts                # 初始化脚本
├─ shared                 # DTO、类型、工具
└─ types                  # 类型扩展
```

## Ant Design Pro 接口

- `POST /api/auth/login`
- `GET /api/auth/profile`
- `GET /api/system/tenant/list`
- `POST /api/system/tenant/add`
- `PUT /api/system/tenant/edit`
- `DELETE /api/system/tenant/remove`
- `PUT /api/system/tenant/status`

用户、角色、菜单模块也已按相同规范预留完整 CRUD 框架。
