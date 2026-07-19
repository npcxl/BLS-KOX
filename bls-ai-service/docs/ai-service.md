# bls-ai-service — AI 能力微服务

> 轻量 AI 能力服务，基于 Koa + TypeScript，独立于主业务后端运行。

## 架构说明

`bls-ai-service` 是 BLS-KOX 的 **AI 能力微服务**，与主业务后端 `bls-server` 解耦部署：

- 独立进程、独立端口（默认 7201）
- 共享 JWT Secret 以实现认证互通
- 共享 Redis 用于限流
- 不访问主业务数据库（无状态的 AI 调用层）

```
客户端 → Nginx → bls-server (主业务 7001)
               → bls-ai-service (AI 能力 7201)
```

## 快速开始

```bash
cd bls-ai-service

# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY 和 JWT_SECRET

# 3. 启动开发服务器
npm run dev

# 4. 构建生产版本
npm run build
npm start
```

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `JWT_SECRET` | 是 | JWT 密钥，与 bls-server 一致 |
| `OPENAI_API_KEY` | 是 | AI 服务 API Key |
| `AI_PROVIDER` | 否 | AI 提供商 (openai/deepseek/qwen/custom)，默认 openai |
| `AI_MODEL` | 否 | 模型名称，默认 gpt-4o-mini |
| `AI_BASE_URL` | 否 | 自定义 API 端点（兼容 OpenAI 格式的第三方服务） |
| `REDIS_HOST` | 否 | Redis 地址，默认 127.0.0.1 |
| `REDIS_PASSWORD` | 是 | Redis 密码 |
| `AI_RATE_LIMIT_PER_MINUTE` | 否 | AI 接口限流 (次/分钟)，默认 10 |

## API 接口

所有接口统一前缀 `/api/ai`，需要 Bearer Token 认证，返回 `{ code, message, data }`。

### 1. AI CRUD Generator

```
POST /api/ai/crud/generate
```

根据自然语言生成数据库建表 SQL、CRUD 配置、菜单建议和权限码。

**请求体：**
```json
{
  "description": "用户管理模块，包含用户名、邮箱、手机号、状态",
  "tableName": "sys_user",
  "tenantIsolation": true
}
```

### 2. AI SQL Assistant

```
POST /api/ai/sql/generate
```

根据自然语言生成只读 SQL（SELECT 语句）。**强制安全策略：**
- 仅允许 SELECT / SHOW / DESCRIBE / EXPLAIN
- 禁止 DML（INSERT/UPDATE/DELETE）和 DDL（CREATE/ALTER/DROP）
- 自动注入 tenantId 隔离条件
- 多语句检测与拦截

**请求体：**
```json
{
  "description": "查询最近 7 天注册的用户数量",
  "tables": ["sys_user"]
}
```

### 3. AI Audit Analyzer

```
POST /api/ai/audit/analyze
```

分析安全日志，输出风险等级和应对建议。

**请求体：**
```json
{
  "logType": "login",
  "logData": "2026-07-19 03:15:23 login_fail ip=192.168.1.100 user=admin ..."
}
```

### 4. AI Config Review

```
POST /api/ai/config/review
```

审查配置文件安全性（.env、docker-compose.yml 等），检测弱密码、默认密钥等。

**请求体：**
```json
{
  "configType": "env",
  "configContent": "DB_PASSWORD=123456\nREDIS_PASSWORD=password\n..."
}
```

## AI Provider 扩展

Provider 采用抽象接口设计，新增模型只需实现 `AiProvider` 接口：

```typescript
// src/provider/types.ts
interface AiProvider {
  readonly name: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
  completeStream?(request: AiCompletionRequest): AsyncIterable<string>;
}
```

在 `src/provider/factory.ts` 中注册新 Provider 即可，不影响业务代码。

当前支持：
- **OpenAI** — `AI_PROVIDER=openai` / `AI_BASE_URL=https://api.openai.com/v1`
- **DeepSeek** — `AI_PROVIDER=deepseek` / 自动使用 api.deepseek.com
- **通义千问** — `AI_PROVIDER=qwen` / 自动使用 dashscope.aliyuncs.com
- **自定义** — `AI_PROVIDER=custom` / `AI_BASE_URL=你的 API 端点`

## Docker 部署

```bash
# 带 AI 服务启动
docker compose --profile ai up -d --build

# 仅 AI 服务
docker compose --profile ai up -d --build bls-ai-service
```

## 安全设计

| 层面 | 措施 |
|------|------|
| 认证 | JWT Bearer Token（与 bls-server 共享密钥） |
| 限流 | Redis 滑动窗口，按用户+路由维度限流 |
| SQL 防护 | sql-guard 拦截非 SELECT 语句，强制 tenantId 隔离 |
| 审计 | 所有 AI 请求写入结构化日志 |
| 租户隔离 | 从 JWT payload 提取 tenantId，SQL 自动注入 |

## 注意事项

- **这不是主业务后端**，不处理用户 CRUD、菜单、角色等业务逻辑
- 不直接连接 MySQL 业务数据库
- AI 请求的响应延迟取决于模型推理时间（通常 2-30 秒）
- 生产环境请设置 `NODE_ENV=production` 并配置强密码
