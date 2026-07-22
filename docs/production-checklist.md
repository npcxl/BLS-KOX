# Production Deployment Checklist

部署到生产环境前，请逐项确认以下配置。

## 🔐 安全配置

### 修改默认密码

- [ ] 修改 `superadmin` 默认密码（`123456`）
- [ ] 修改 `admin`（租户 `100000`）默认密码
- [ ] 修改 **MinIO 默认账号密码**（`.env.docker` 中 `MINIO_USER` / `MINIO_PASSWORD`）
- [ ] 同步修改 `sql/Init.sql` 中 `sys_storage_config` 的 `access_key` / `secret_key` 种子数据
- [ ] 生产环境删除或停用所有演示账号

### 修改密钥

- [ ] **JWT_SECRET** — 设置为 ≥ 32 字符的随机字符串
  ```bash
  openssl rand -base64 48
  ```
- [ ] **API_SIGN_SECRET** — 防重放 HMAC 密钥，必须修改
  ```bash
  openssl rand -base64 32
  ```
- [ ] **DB_PASSWORD** — 强密码，不使用默认值
- [ ] **REDIS_PASSWORD** — 强密码，不使用默认值

### 网络安全

- [ ] **CORS_ORIGINS** — 配置为实际前端域名，不使用通配符
  ```bash
  CORS_ORIGINS=https://admin.your-domain.com
  ```
- [ ] 开启 **HTTPS**（Nginx / CDN 配置 SSL 证书）
- [ ] 配置 **反向代理** 限制请求体大小
- [ ] 开启 **TRUST_PROXY=true**（Nginx 前置时）

### 数据库安全

- [ ] MySQL 端口不对公网暴露（仅应用内网访问）
- [ ] Redis 端口不对公网暴露，配置 `requirepass`
- [ ] 配置数据库**自动备份**
  ```bash
  BACKUP_ENABLED=true
  BACKUP_INTERVAL_HOURS=24
  ```

### 日志与监控

- [ ] 配置**日志脱敏**（password/token/secret 等字段自动脱敏已内置）
- [ ] 配置 Prometheus + Grafana 监控面板
- [ ] 配置告警规则（5xx 错误率、P95 延迟、DB/Redis 错误等，见 `deploy/prometheus/rules/`）
- [ ] 检查安全日志写入是否正常（`sys_security_log` 表）
- [ ] **AI token/成本监控**：确认 AI 调用日志正常输出。生产环境建议将 AI token 用量接入可查询的日志平台、Prometheus 指标或数据库报表（当前仅打日志，需自行扩展）

## 🚀 部署配置

### 环境变量检查

```bash
NODE_ENV=production
APP_PORT=6001

# 数据库
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<强密码>
DB_NAME=bls
DB_CONNECTION_LIMIT=20

# JWT
JWT_SECRET=<≥32字符随机字符串>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<强密码>

# CORS
CORS_ORIGINS=https://admin.your-domain.com

# 防重放
REPLAY_ENABLED=true
API_SIGN_SECRET=<随机HMAC密钥>

# 限流
RATE_LIMIT_MAX=200

# 备份
BACKUP_ENABLED=true
BACKUP_INTERVAL_HOURS=24

# OpenTelemetry（可选）
OTEL_TRACES_ENABLED=false
```

### Docker 部署

```bash
# 1. 确认 .env 已配置
cat .env

# 2. 构建并启动
docker compose up -d --build

# 3. 确认所有服务健康
docker compose ps

# 4. 查看日志
docker compose logs -f bls-server
```

### 健康检查

- [ ] `GET /api/health` 返回 200
- [ ] `GET /api/ready` 返回 200（MySQL + Redis 均正常）
- [ ] `GET /api/metrics` 返回 Prometheus 指标
- [ ] 前端页面可正常访问

## 🧹 清理

### 演示数据

- [ ] 删除 `sql/Init.sql` 中的演示数据（或仅使用精简版 Init.sql）
- [ ] 关闭演示模式：`sys_config` 中 `sys.demo.enabled` 设为 `false`
- [ ] 删除示例租户和测试用户

### 模板残留

- [ ] 移除 Ant Design Pro 模板页面（`/form/*`, `/list/*`, `/profile/*`, `/account/*`, `/result/*`）
- [ ] 修改 `manifest.json` 中的应用名称
- [ ] 清理 locales 中的模板文本（`ant.design`、`admin/ant.design` 等）
- [ ] 替换登录页背景图为自有资源

### 文件存储

- [ ] 配置 MinIO / OSS / S3 实际存储（默认使用本地存储仅用于开发）
- [ ] 设置文件上传大小限制（`sys.upload.maxSize`）

### AI 服务

- [ ] **Ollama 模型拉取**：确认 `ollama-pull` 容器成功拉取 `qwen2.5:7b`（约 4GB），检查磁盘空间 ≥ 20GB
- [ ] 如需启用更多模型，手动执行 `docker exec bls-ollama ollama pull <model>`
- [ ] 确认 `/api/ai/chat/completions` 流式响应正常（SSE 无缓冲中断）

### 前端

- [ ] 运行 `npm run test` 确保 Vitest 单元测试全部通过
- [ ] **E2E 测试**（建议）：当前项目未内置 Playwright/Cypress，建议生产部署前至少手动验证核心流程（登录 → CRUD → AI 对话）

## ✅ 最终检查

- [ ] 所有 `CHANGE_TO_*` 占位符已替换
- [ ] 所有默认密码已修改
- [ ] HTTPS 已启用
- [ ] 数据库备份已配置并验证
- [ ] 监控告警已配置
- [ ] 安全中心页面可正常访问
- [ ] 限流和防重放功能已验证
