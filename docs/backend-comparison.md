# 双后端定位

BLS-KOX 提供两套后端实现：**Koa（TypeScript）** 和 **Spring Boot（Java）**。
两套后端**不是竞争关系**，而是针对不同场景和团队背景的互补方案。

## 核心理念

- 两套后端各自独立可运行，**选一套即可**
- 共享同一套前端、MySQL、Redis、`sql/Init.sql`、API 规范
- 前端代码无需任何修改，切换后端只需改代理地址

## 定位差异

### Koa 后端（bls-server）

**轻量、灵活、快速二开**

- 适合 Node.js / TypeScript 全栈团队
- `defineCrudModule()` 配置式 CRUD，一行代码生成完整接口
- 中间件链清晰：JWT → 租户 → RBAC → 防重放 → 限流
- Zod 运行时校验，TypeScript 类型安全
- 部署轻量：Node.js 单进程，内存占用小
- 适合：快速原型、SaaS MVP、Node.js 全栈开发者

### Java 后端（bls-java-server）

**工程化、稳定、企业级生态**

- 适合 Java / Spring 技术栈团队
- Spring Boot 3 + Spring Security + MyBatis-Plus 标准三层架构
- 注解式 AOP：`@DistributedLock`、`@Idempotent`、`@RateLimit`
- Spring Security 方法级权限控制（`@PreAuthorize`）
- Actuator + Micrometer + Prometheus 生产级监控
- 未来可平滑演进至 Spring Cloud 微服务
- 适合：企业级项目、Java 团队、有微服务演进需求的场景

## 共享基础设施

| 组件 | 说明 |
|------|------|
| **前端** | 同一套 `bls-admin`（React 19 + Ant Design Pro 6） |
| **数据库** | 同一套 MySQL 8.0 + 同一份 `sql/Init.sql` |
| **缓存** | 同一套 Redis 7（Session、限流、分布式锁） |
| **API 规范** | 统一的 `{ code, message, data, total }` 响应格式 |
| **安全体系** | JWT + RBAC + 多租户 + 防重放，实现方式不同但行为一致 |

## 对比表

| 维度 | Koa (TypeScript) | Java (Spring Boot) |
|------|-------------------|---------------------|
| **定位** | 轻量灵活，快速二开 | 工程化稳定，企业级 |
| **语言 / 运行时** | TypeScript 6 / Node.js 22 | Java 21 / JVM |
| **框架** | Koa 3 | Spring Boot 3.3 |
| **ORM / 数据层** | Kysely（类型安全 SQL 构建器） | MyBatis-Plus 3.5 |
| **开发速度** | `defineCrudModule()` 配置式，一行生成 CRUD | Controller + Service + Mapper 标准三层 |
| **工程规范** | 目录约定 + 自动路由扫描 | Spring 标准分层 + 依赖注入 |
| **CRUD 方式** | 工厂函数配置（`defineCrudModule`） | 注解 + 泛型 Service（`BaseCrudService`） |
| **权限控制** | 中间件 `hasPerm('xxx')` | `@PreAuthorize("hasAuthority('PERM_xxx')")` |
| **参数校验** | Zod schema（运行时） | `@Valid` + Jakarta Validation（编译时 + 运行时） |
| **多租户** | `tenantWhere()` SQL 过滤 | `TenantContext` ThreadLocal + MyBatis-Plus 拦截器 |
| **缓存** | ioredis（自定义 Proxy 指标采集） | Spring Data Redis + Lettuce 连接池 |
| **分布式能力** | 函数式 API（`createDistributedLock` 等） | 注解式 AOP（`@DistributedLock` 等） |
| **监控** | prom-client + OpenTelemetry | Actuator + Micrometer + Prometheus |
| **API 文档** | 自动生成 `openapi.json` | Knife4j（`/doc.html`） |
| **微服务演进** | 模块化单体，无框架级支持 | Spring Cloud 生态就绪 |
| **部署体积** | ~150MB（Node.js Alpine） | ~250MB（JRE Alpine） |
| **启动时间** | ~2s | ~5s |
| **适合人群** | Node.js 全栈、快速原型、中小项目 | Java 团队、企业项目、有微服务规划 |

## 如何选择

| 场景 | 推荐 |
|------|------|
| 团队主要技术栈是 Node.js / TypeScript | Koa |
| 团队主要技术栈是 Java / Spring | Java |
| 快速搭建 SaaS 原型 / MVP | Koa |
| 企业级项目，需要完善的工程规范 | Java |
| 未来有计划演进到微服务 | Java |
| 追求轻量部署，低资源占用 | Koa |
| 两套都学，了解不同后端架构 | 都跑起来，切换代理即可对比 |

## 切换后端

两套后端 API 完全兼容，切换只需一步：

**本地开发**：修改 `bls-admin/config/proxy.ts` 的 `target` 端口（6001 ↔ 8080）

**Docker 部署**：修改 `nginx.conf` 的 `proxy_pass` 地址（`bls-server:7001` ↔ `bls-java-server:8080`）

> 如果只用一套后端，可运行清理脚本移除另一套：
> ```powershell
> .\scripts\cleanup-backend.ps1
> ```
