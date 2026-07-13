# Changelog

## [0.2.0] - 2026-07-13

### Features
- **Outbox Pattern (P7)** — 事务性事件发布，原子 Claim，Stale Recovery，Dead Letter，指数退避
- **Queue / Worker (P6)** — 异步任务队列，支持 Export / Import / Notification / Webhook
- **Data Scope (P9)** — 角色级数据权限（ALL/TENANT/DEPT/DEPT_AND_CHILDREN/SELF）
- **Backup / Restore / DR** — 定时自动备份，mysqldump 导出，mysql 恢复
- **用户踢下线** — 批量下线用户活跃会话（需 `system:user:kick` 权限）
- **迁移引擎增强** — 事务边界、Checksum 漂移检测
- **WebSocket 稳定性修复** — 未登录不连接，失败完全静默

### Documentation
- docs/outbox.md — Outbox 设计文档
- docs/roadmap.md

## [0.1.0] - 2026-07-10

### Features
- 多租户数据隔离与 Ownership Guard
- RBAC 权限控制（角色 → 菜单 → 按钮）
- JWT Access/Refresh Token 体系 + Session Center
- Refresh Token Rotation + Reuse Detection
- 泛型 CRUD 工厂 (`defineCrudModule`)
- 动态列配置系统
- 防重放攻击（Timestamp + Nonce + HMAC）
- Redis 多维度限流
- 安全审计日志
- 全局搜索（Ctrl+K）
- Excel 导入导出
- WebSocket 实时推送
- Prometheus Metrics (`/api/metrics`)
- Docker Compose 一键部署
- GitHub Actions CI

### Documentation
- README 重构为开源友好格式
- docs/ 文档体系（架构/多租户/认证/RBAC/CRUD/安全/可观测性/部署）
- CONTRIBUTING.md / SECURITY.md / Issue / PR 模板

---

格式遵循 [Keep a Changelog](https://keepachangelog.com/) 和 [Semantic Versioning](https://semver.org/)。
