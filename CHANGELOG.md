# Changelog

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
