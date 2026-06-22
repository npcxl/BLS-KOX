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
- 新业务优先使用 `Kysely` 编写查询，底层 MySQL 连接池保持不变

## 数据访问约定

本项目保留现有 MySQL 连接、事务、租户上下文和权限体系不变，只在“新业务代码”里使用 `Kysely`。

### 为什么这样做

- 底层连接池、环境变量、事务封装已有稳定实现，尽量不动
- `Kysely` 适合写新业务，类型友好、可组合、可读性更强
- 旧代码可以继续用原来的方式，新功能可以直接走 `Kysely`
- 这样迁移成本低，不需要一次性重构整个后端

### 新业务接入步骤

#### 1. 复用现有数据库入口

`src/core/database.ts` 负责创建 MySQL 连接池，并提供 `getDb()`。
新业务代码只需要在仓储层调用 `await getDb()`，不要自己再创建一套连接。

#### 2. 只在仓储层写数据库查询

建议保持分层不变：

- `Controller` 负责接收参数、做校验、返回响应
- `Service` 负责业务编排
- `Repository` 负责 `Kysely` 查询

这样以后迁移、测试和复用都会更简单。

#### 3. 字段别名不要直接写成一整段字符串 SQL

下面这种写法不要直接塞进 `select()`：

```ts
.select(['product_id AS id'])
```

Kysely 会把它当成列名，而不是 SQL 片段。

推荐两种方式：

- 用 Kysely 的字段选择语法
- 或者在确实需要时，显式使用 `sql.raw()` / `sql.ref()` 这类表达式

#### 4. 推荐的查询写法

```ts
const db = await getDb();

const rows = await db
  .selectFrom('biz_product')
  .select((eb) => [
    eb.ref('product_id').as('id'),
    eb.ref('product_code').as('productCode'),
    eb.ref('product_name').as('productName'),
    eb.ref('created_at').as('createdAt'),
  ])
  .where('deleted', '=', 0)
  .where('tenant_id', '=', tenantId)
  .orderBy('product_id', 'desc')
  .limit(20)
  .offset(0)
  .execute();
```

#### 5. 常见约束

- 所有多租户表都要保留 `tenant_id` 过滤
- 所有软删除表都要保留 `deleted = 0`
- 列表接口要统一分页、排序、模糊搜索
- 新增/修改时只写允许字段，不要把整段请求体直接入库

### 新业务和旧业务分开演进

- 现有模块：保持原实现，稳定优先
- 新增模块：优先使用 Kysely
- 需要时可逐步把老模块迁移到同一套查询风格

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
- 密码：`123456`

平台管理员：admin / 123456
默认租户管理员：admin / 123456
默认租户普通用户：user / 123456

## 目录结构

```text
src
├─ app.ts                 # 应用入口
├─ config                 # 环境配置
├─ core                   # 数据库、路由、错误、响应等基础能力
├─ middleware             # JWT、租户、权限、错误中间件
├─ modules                # 业务模块
│  ├─ auth
│  ├─ business            # 新业务优先使用 Kysely
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
