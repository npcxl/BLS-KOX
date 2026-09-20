# BLS-KOX 长期记忆（跨会话）

> 只记录稳定、跨会话有用的事实。日常细节写入 `YYYY-MM-DD.md`。

## 环境

- 默认 `node` 是 v16，项目要求 ≥22。可用 Node 22：
  `C:\Users\18569\.workbuddy\binaries\node\versions\22.22.2\node.exe`（把该目录前置到 PATH 后 `npm` 即可用）。
- JDK 21：`C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot`；默认 `mvn` 跑在 JDK 8 上必须改 `JAVA_HOME`。
- `bls-java-server` 的 Maven 依赖在本机拉不齐（Maven Central 不可达，缺 `io.jsonwebtoken:jjwt-bom:0.12.6`），
  `mvn compile/test` 目前无法执行。
- **写 `sql/Init.sql` 必须用 shell/脚本直写**：IDE 编辑工具对该文件的写入会被静默丢弃（报成功但未落盘）。
  改完务必 `git diff sql/Init.sql` 复核。
- PowerShell 的 `Get-Content`/`Select-String` 默认按 ANSI 解码，UTF-8 中文会显示乱码；判断内容用 `git diff`。

## 项目约定（改代码时遵守）

- 权限码以后端为准；前端 `permissions` 与 SQL 种子必须与后端 `hasPerm('...')` 完全一致
  （常见坑：前端写 `:create` 而后端/SQL 是 `:add`）。
- `ctx.state.user` 同时提供 `perms` 与 `permissions`（`AuthService.profile` 双写），`hasPerm` 兼容两者。
- Koa CRUD 工厂（`core/crud.ts`）契约：
  - 6 个端点 `GET /list`、`GET /:id`、`POST /add`、`PUT /edit`、`DELETE /remove`、`PUT /status`；
  - 推荐用 `defineCrudConfig({ table, pkField, fields, actions, createDefaults })`：`fields` 是单一字段来源，
    自动推导 createFields/updateFields/searchFields/filterFields/响应投影/Zod/statusField；
  - `actions` 关闭的端点不注册；显式数组与显式 `schema` 优先于 `fields` 派生；无 `fields` 的旧配置保持旧行为；
  - 配置非法（标识符/枚举/范围/系统字段开放写入/无可用 add|edit 字段/status 缺字段）在**路由注册阶段抛错** → 应用启动失败；
  - 审计字段（create_by/create_time/update_by/update_time）永不可由请求体写入，只能由 `createDefaults` 提供；
  - `select:false` 的字段不进入 list/detail 响应；响应投影始终包含主键；
  - 字段白名单 `createFields` / `updateFields` / `filterFields`，系统字段（主键/tenant_id/deleted/审计字段）不可写；
  - 租户、软删除、Data Scope 由 `applyScope()` 统一构造，事务内外必须复用（不要在事务里重建查询）；
  - 修改/删除/状态/详情命中 0 行 → 404；批量删除统一请求体 `{ ids: [] }`（Koa 与 Java 均兼容裸数组/逗号串）。
- 全局表（无 `tenant_id`）：`sys_menu`、`sys_package`、`sys_package_menu`、`sys_role_menu`、`sys_user_role`。
  其中 `sys_menu` / `sys_package` / `sys_package_menu` / `sys_role_menu` **没有 `deleted` 列**，不要写入该字段。
- 多租户表的 `tenant_id` 只能来自服务端请求上下文，请求体不可覆盖。
- 改页面行为或接口时同步更新 `docs/crud.md`、`docs/backend-koa.md`、`docs/api-compatibility.md`
  与 `sql/Init.sql`；已部署库用 `bls-server/migrations/` 增量脚本（`npm run db:migrate`）。
- **`bls-memory/` 必须同步**（用户明确要求「改逻辑就要更新」）：该目录是按页面的「前端操作 → 后端校验」
  AI 记忆库（英文，26 个页面文档 + `00-common/` 共享文档）。改逻辑后要更新对应 `pages/*.md` 与受影响的
  `00-common/*.md`，并在 `bls-memory/CHANGELOG.md` 追加条目（Keep a Changelog + 文档集 SemVer）。
  每个文档头部元信息行格式：`> **Document version:** x.y.z · **Code version:** V · **Verified commit:** SHA · **Last verified:** DATE`；
  `Verified commit` 记录「应用代码」所在提交，仅改 `bls-memory/`/`docs/`/`.codebuddy/` 的提交不使验证失效。
  代码未提交但已验证时：元信息行保留当前 HEAD，并在正文加一行 uncommitted 提示。
