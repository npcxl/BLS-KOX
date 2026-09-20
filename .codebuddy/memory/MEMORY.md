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
  - 字段白名单 `createFields` / `updateFields` / `filterFields`，系统字段（主键/tenant_id/deleted/create_*/update_*）默认不可写；
  - 租户、软删除、Data Scope 由 `applyScope()` 统一构造，事务内外必须复用（不要在事务里重建查询）；
  - 修改/删除/状态/详情命中 0 行 → 404；批量删除统一请求体 `{ ids: [] }`（Koa 与 Java 均兼容裸数组/逗号串）。
- 全局表（无 `tenant_id`）：`sys_menu`、`sys_package`、`sys_package_menu`、`sys_role_menu`、`sys_user_role`。
  其中 `sys_menu` / `sys_package` / `sys_package_menu` / `sys_role_menu` **没有 `deleted` 列**，不要写入该字段。
- 多租户表的 `tenant_id` 只能来自服务端请求上下文，请求体不可覆盖。
- 改页面行为或接口时同步更新 `docs/crud.md`、`docs/backend-koa.md`、`docs/api-compatibility.md`
  与 `sql/Init.sql`；已部署库用 `bls-server/migrations/` 增量脚本（`npm run db:migrate`）。
