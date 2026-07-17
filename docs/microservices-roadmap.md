# 微服务路线图

> **当前状态**：模块化单体 + Koa 示范微服务。
> **不是全面微服务**，Java 后端不拆微服务。

## 现状

| 服务 | 类型 | 说明 |
|------|------|------|
| bls-server | 模块化单体（Koa） | 主后端，包含全部业务模块 |
| bls-java-server | 模块化单体（Spring Boot） | 可选 Java 后端，API 兼容 |
| bls-event-service | Koa 示范微服务 | 事件中心、安全审计、操作日志接收 |

- 共享 MySQL + Redis
- 已内置分布式锁、幂等、限流、链路追踪
- bls-event-service 通过内部 HTTP + Outbox 重试通信，可选启动

## 已实现

- [x] requestId / traceId 全链路传递
- [x] Redis 分布式锁
- [x] Redis 幂等控制（Idempotency-Key）
- [x] Redis 限流（Lua 滑动窗口）
- [x] Prometheus 指标采集 + 健康检查
- [x] **bls-event-service** — 事件中心 Koa 微服务示范
  - 独立部署，Docker `profile: event` 控制
  - 内部 HTTP + Outbox 重试
  - 不启动不影响主系统
  - 详见 [event-service.md](./event-service.md)

## 不拆的理由

1. **团队规模**：中小团队，单体更易维护
2. **业务复杂度**：管理后台 CRUD 为主，不需要弹性伸缩
3. **运维成本**：单体部署简单，不需要 K8s + 服务网格
4. **能力已预留**：锁、幂等、限流等分布式能力已内置

## 何时考虑拆分

- 单模块代码量超过 10 万行
- 不同模块有独立发布节奏
- 团队超 20 人，需独立维护
- 某模块需独立扩缩容

---

> **重要**：当前是**模块化单体 + Koa 示例微服务**。Java 后端不拆微服务。
