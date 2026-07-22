# 部署指南

> ⚠️ **分支说明**：当前文档基于 `master` 分支。`dev` 分支包含最新功能和实验性特性，可能存在未修复的 Bug，生产环境请使用 `master` 分支。

## Docker Compose 部署

```bash
git clone https://github.com/npcxl/BLS-KOX.git
cd BLS-KOX

cp .env.example .env
# 编辑 .env，修改所有 CHANGE_TO_* 值为强密码

docker compose up -d --build
```

检查运行状态：

```bash
docker compose ps
docker compose logs -f bls-server
docker compose logs -f bls-ai-service
curl -f http://localhost/api/health
```

## 环境变量说明

| 变量 | 说明 | 必填 |
|------|------|------|
| `DB_PASSWORD` | MySQL root 密码 | ✅ |
| `REDIS_PASSWORD` | Redis 密码 | ✅ |
| `JWT_SECRET` | JWT 签名密钥（≥32字符） | ✅ |
| `OPENAI_API_KEY` | AI API 密钥 | 使用 AI 必填 |
| `API_SIGN_SECRET` | API 签名密钥（HMAC模式必填） | 按需 |
| `CORS_ORIGINS` | 允许的跨域来源 | 生产必填 |
| `DB_HOST` | MySQL 地址 | 默认 mysql |
| `REDIS_HOST` | Redis 地址 | 默认 redis |
| `DB_NAME` | 数据库名 | 默认 bls |
| `AI_PROVIDER` | AI 提供商（ollama/deepseek/openai） | Docker 默认 ollama |
| `AI_MODEL` | AI 模型名称 | Docker 默认 qwen2.5:7b |

## 数据库初始化

Docker Compose 首次启动时自动执行 `sql/init.sql`。如果已有数据库需要迁移：

```bash
cd bls-server
npm run db:migrate up
```

## 首次登录

- 账号：`superadmin`
- 密码：`123456`

> ⚠️ 该账号仅适用于本地演示。生产部署后必须立即修改密码。

## 备份恢复

```bash
cd bls-server
npm run db:backup        # 全量备份
npm run db:restore <file> # 恢复备份
```

## 升级步骤

```bash
git pull
# 如有数据库迁移，先备份
npm run db:backup
docker compose build
docker compose up -d
docker compose ps
```

## 回滚步骤

```bash
git checkout <previous-tag>
docker compose build
docker compose up -d
```

## 日志查看

```bash
docker compose logs -f bls-server
docker compose logs -f bls-nginx
```

## 健康检查

```bash
curl http://localhost/api/health
```

## 常见故障

| 现象 | 排查 |
|------|------|
| 后端启动失败 | 检查 `.env` 中 `JWT_SECRET`/`DB_PASSWORD`/`REDIS_PASSWORD` 是否设置 |
| 数据库连接失败 | 检查 MySQL 容器健康状态：`docker compose ps mysql` |
| 502 Bad Gateway | 检查后端是否启动：`docker compose logs bls-server` |
