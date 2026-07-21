# BLS-KOX 文档中心

## 快速开始

- [快速开始](./getting-started.md) — 环境要求、安装、启动、演示账号
- [Docker 部署指南](./docker-deploy.md) — Docker Compose 一键部署、Koa/Java 切换、AI 服务配置、故障排查
- [部署指南](./deployment.md) — 传统部署方式
- [生产检查清单](./production-checklist.md) — 上线前安全检查

## 架构

- [总体架构](./architecture.md) — 请求链路、中间件、双后端总览
- [双后端定位](./backend-comparison.md) — Koa vs Java 定位差异、对比表、如何选择
- [Koa 后端](./backend-koa.md) — Koa + TypeScript 架构、CRUD 工厂、中间件链
- [Java 后端](./backend-java.md) — Spring Boot 架构、Security、MyBatis-Plus、JWT
- [API 兼容性](./api-compatibility.md) — 双后端 API 规范、返回结构、字段命名一致性
- [微服务路线图](./microservices-roadmap.md) — 模块化单体 → 微服务拆分路线

## 开发指南

- [CRUD 工厂](./crud.md) — defineCrudModule 一行配置生成 CRUD、Koa/Java 对比
- [API 版本化](./api-versioning.md) — 路由前缀、OpenAPI、Internal 接口
- [认证体系](./auth.md) — Token、Session Center、时序图
- [RBAC 权限](./rbac.md) — 角色-菜单-按钮
- [多租户](./multi-tenant.md) — 数据隔离、权限守卫
- [安全能力](./security.md) — 防重放、限流、审计

## 分布式与可观测性

- [分布式能力](./distributed-capabilities.md) — 分布式锁、幂等、限流、链路追踪
- [缓存策略](./cache.md) — Redis 缓存设计、Key 规范、故障降级
- [限流](./rate-limit.md) — 多维度限流、Lua 脚本、注解使用
- [幂等性](./idempotency.md) — 请求级幂等、Idempotency-Key、状态机
- [Outbox 模式](./outbox.md) — 事务事件发布
- [可观测性](./observability.md) — Metrics、告警、日志

## 模块专题

- [AI 智能助手](./modules/ai-service.md) — 快速生成 CRUD 模块、SQL 助手、安全审计、配置审查
- [CrudTable 和 Hook 封装](./frontend/crud-table.md) — 前端表格组件使用文档
- [Webhook 集成](./modules/webhook.md) — Webhook 使用场景和底层集成
- [全局搜索](./modules/global-search.md) — 前端全局搜索技术实现
- [存储桶](./modules/storage.md) — 多存储后端通用文档
- [登录态策略](./modules/session-policy.md) — 系统多开策略及单开策略

## 历史归档

- [Java 后端迁移方案](./archive/java-migration-plan.md) — 历史迁移方案设计规范
- [动态接口生成文档](./archive/dynamic-api-generation.md) — 已合并到 CRUD 工厂文档
- [文档整改计划](./archive/documentation-restructure-plan.md) — 本次文档整改方案

## 维护

- [文档规范](./conventions.md) — 命名、目录、元信息规范
