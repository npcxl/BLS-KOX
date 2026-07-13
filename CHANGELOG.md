# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-13

### Added
- Multi-tenant data isolation with Ownership Guard
- RBAC permission control (Role → Menu → Button)
- JWT Access/Refresh Token system with Session Center
- Refresh Token Rotation + Reuse Detection
- Anti-replay protection (Timestamp + Nonce + HMAC)
- Redis multi-dimensional rate limiting
- Security audit logging
- Global search (Ctrl+K)
- Excel import/export
- WebSocket real-time push
- Prometheus Metrics (`/api/metrics`)
- Queue / Worker async job system
- Outbox Pattern for transactional event publishing
- Backup / Restore / DR with automatic scheduled backups
- Data Scope (ALL/TENANT/DEPT/DEPT_AND_CHILDREN/SELF)
- API Versioning with /openapi/v1 and /internal prefixes
- Webhook Platform with HMAC signing and delivery logs
- File Security (extension/MIME/magic number validation, SSRF protection)
- Configuration Center with Redis caching and strict schema validation
- Generic CRUD factory (`defineCrudModule`)
- Dynamic column configuration system
- Security Event Center (collect → aggregate → score → auto-response)
- Docker Compose one-click deployment
- GitHub Actions CI/CD

### Security
- IP Blacklist with automatic/manual blocking
- Blocked IP middleware
- User session revocation (force logout)
- Nginx security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- Production startup security validation (weak secret rejection)
- `server_tokens off` in nginx
