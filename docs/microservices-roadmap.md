# 微服务路线图

> **当前状态**：模块化单体（Modular Monolith）+ Koa 示范微服务。
> 本文档描述当前架构状态与未来拆分方向。

## 现状

BLS-KOX 采用**模块化单体 + 示范微服务**架构：

- **bls-server**（Koa）：主后端，模块化单体，单进程部署
- **bls-java-server**（Spring Boot）：可选 Java 后端，模块化单体
- **bls-event-service**（Koa）：事件中心微服务，独立部署，可选启动
- 共享数据库（MySQL + Redis）
- 包级别模块划分（controller → service → mapper）
- 已内置分布式基础能力（锁、幂等、限流、trace）

### 微服务示范：bls-event-service

- 第一个 Koa 微服务，负责事件中心、安全审计、操作日志接收
- 独立部署，通过内部 HTTP + Outbox 重试与主后端通信
- 可选启动：不启动时主系统仍可正常运行
- Docker Compose 使用 `profile: event` 控制启动
- **Java 后端不拆分微服务**，保持模块化单体
- 详见 [event-service.md](./event-service.md)

## 拆分路线

### Phase 1：分布式能力预留 ✅（当前已完成）

- [x] requestId / traceId 全链路传递
- [x] Redis 分布式锁（SET NX）
- [x] Redis 幂等控制（Idempotency-Key）
- [x] Redis 限流（Lua INCR + EXPIRE）
- [x] Prometheus 指标采集
- [x] 健康检查端点

### Phase 1.5：Koa 示范微服务 ✅（当前已完成）

- [x] bls-event-service：事件中心、安全审计、操作日志接收
- [x] 内部 HTTP 通信 + Outbox 重试
- [x] Docker Compose profile 控制启动
- [x] 主系统不依赖 event-service 也可运行
- [ ] 更多示范微服务（按需添加）

### Phase 2：模块解耦（待定）

- [ ] 模块间通过接口通信，而非直接调用 Service
- [ ] 数据库按模块分 Schema（同库不同 Schema）
- [ ] 引入事件总线（如 Spring ApplicationEvent / EventEmitter）
- [ ] 异步任务队列独立为 Worker 进程

### Phase 3：基础设施拆分（待定）

- [ ] 引入 API 网关（Kong / Spring Cloud Gateway）
- [ ] 引入注册中心（Nacos）
- [ ] 引入配置中心（Nacos Config）
- [ ] 分布式链路追踪（Jaeger / SkyWalking）

### Phase 4：服务拆分（待定）

| 候选微服务 | 职责 | 优先级 |
|-----------|------|--------|
| event-service | 事件中心、安全审计、操作日志 | ✅ 已实现（Koa 示范） |
| auth-service | 认证、授权、Token 管理 | 高 |
| tenant-service | 租户管理 | 中 |
| user-service | 用户、角色、部门管理 | 高 |
| dict-service | 字典数据 | 低 |
| config-service | 系统配置 | 低 |
| file-service | 文件上传、对象存储 | 中 |
| notification-service | 通知、Webhook | 低 |

### Phase 5：数据拆分（待定）

- [ ] 每个服务独立数据库
- [ ] 引入分布式事务（Seata / Saga）
- [ ] CQRS 读写分离

## 不拆的理由

当前模块化单体已经足够满足：

1. **团队规模**：中小团队，单体更易维护
2. **业务复杂度**：管理后台 CRUD 为主，不需要微服务的弹性伸缩
3. **运维成本**：单体部署简单，不需要 K8s + 服务网格
4. **分布式能力已预留**：锁、幂等、限流等能力已内置，未来拆分时可直接复用

## 何时考虑拆分

- 单模块代码量超过 10 万行
- 不同模块有独立的发布节奏
- 团队规模超过 20 人，需要独立团队维护不同服务
- 某模块需要独立扩缩容

---

> **重要**：
> - 当前不是全面微服务，而是**模块化单体 + Koa 示例微服务**
> - Java 后端不拆微服务，继续作为模块化单体
> - 即使未来拆分，分布式能力接口保持统一，确保迁移平滑
