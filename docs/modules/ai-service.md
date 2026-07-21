# AI 智能助手 (bls-ai-service)

BLS-KOX 内置的 AI 能力微服务，基于大模型提供**快速生成页面**、SQL 助手、安全审计等智能功能。

> 当前支持的 AI 提供商：DeepSeek、OpenAI、通义千问，以及任何兼容 OpenAI API 的自定义端点。

## 快速开始

在 `.env.docker`（Docker 部署）或 `.env`（本地开发）中配置：

```bash
AI_PROVIDER=deepseek          # AI 提供商: deepseek / openai / qwen / custom
AI_MODEL=deepseek-chat        # 模型名称
OPENAI_API_KEY=你的API密钥     # 从 AI 平台获取
AI_BASE_URL=                  # 可选，自定义 API 地址
```

Docker 部署时 AI 服务默认随主服务一同启动（端口 7201）。本地开发时手动启动：

```bash
cd bls-ai-service
npm install
npm run dev     # http://localhost:7201
```

## 模块总览

| 模块 | 端点 | 功能 |
|------|------|------|
| **KOX-AI 对话** | `POST /api/ai/chat/completions` | 智能对话，自然语言生成前后端代码 |
| **CRUD 生成器** | `POST /api/ai/crud/generate` | 一键生成完整的 CRUD 模块（建表+后端+前端+菜单+权限） |
| **SQL 助手** | `POST /api/ai/sql/generate` | 自然语言生成安全 SQL，四重防护确保只读 |
| **审计分析器** | `POST /api/ai/audit/analyze` | 智能分析系统日志，识别安全风险 |
| **配置审查器** | `POST /api/ai/config/review` | 审查配置文件安全性，检测弱密码、默认密钥等风险 |

所有接口统一前缀 `/api/ai`，需要 Bearer Token 认证，返回格式 `{ code, message, data }`。

---

## 1. KOX-AI 对话 — 自然语言生成代码

**端点**: `POST /api/ai/chat/completions`  
**支持模式**: 非流式 (JSON) / 流式 (SSE)

前端页面入口：登录后左侧菜单 **「KOX-AI」**，提供类似 ChatGPT 的对话界面。

### 它能做什么

AI 内置了 BLS-KOX 平台的全部技术规范，可以直接生成符合项目规范的代码：

| 生成内容 | 说明 |
|----------|------|
| **CREATE TABLE SQL** | 遵循命名规范（`biz_` 前缀、`tenant_id`、`deleted` 等标准字段） |
| **Menu INSERT SQL** | 自动生成菜单插入语句 |
| **Role 权限 SQL** | 自动生成角色权限绑定语句 |
| **sys_page_config SQL** | 动态页面配置初始化 |
| **sys_page_column_config SQL** | 动态列配置初始化（强制必填） |
| **后端代码** | 使用 `defineCrudModule()` 工厂，单文件模块模式 |
| **前端代码** | 使用 `CrudTablePage` + `usePageConfig()` 动态列配置 |

### 用法示例

在 KOX-AI 对话中输入：

```
创建一个客户管理模块，包含字段：客户名称、联系电话、客户等级(VIP/普通)、备注
```

AI 会生成完整的 8 项交付物，包含可直接执行的 SQL 和前后端代码。

### 请求格式

```json
{
  "messages": [
    { "role": "user", "content": "创建一个商品管理模块" }
  ],
  "stream": true
}
```

---

## 2. CRUD 生成器 — 结构化模块生成

**端点**: `POST /api/ai/crud/generate`

相比对话模式，CRUD 生成器输出**严格的 JSON 格式**，适合程序化调用或需要精确结构化的场景。

### 请求参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `description` | string (1-2000) | ✅ | 业务模块的自然语言描述 |
| `tableName` | string (1-64) | ✅ | 目标表名，仅允许 `[a-zA-Z_][a-zA-Z0-9_]*` |
| `tenantIsolation` | boolean | 否，默认 `true` | 是否启用租户隔离 |

### 返回结构

```json
{
  "tableName": "biz_product",
  "sql": "CREATE TABLE biz_product (...)",
  "crudConfig": {
    "columns": [
      { "field": "product_name", "label": "商品名称", "type": "text", "required": true, "searchable": true }
    ],
    "enablePagination": true,
    "enableExport": true
  },
  "menuSuggestion": { "name": "商品管理", "icon": "ShoppingOutlined", "parentPath": "/business" },
  "permissionCodes": ["biz:product:list", "biz:product:add", "biz:product:edit", "biz:product:remove"],
  "dynamicColumns": { "list": [...], "form": [...], "detail": [...] }
}
```

---

## 3. SQL 助手 — 安全只读查询

**端点**: `POST /api/ai/sql/generate`

用自然语言生成 SQL 查询语句，**四重安全防护**确保只生成只读 SQL。

### 安全策略

| 层级 | 措施 |
|------|------|
| AI Prompt | 要求 AI 只输出 SELECT/SHOW/DESCRIBE/EXPLAIN |
| 关键字黑名单 | 拦截 INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE 等 |
| 多语句防护 | 禁止分号 `;` 防止 SQL 注入 |
| 前缀白名单 | 必须以 SELECT/SHOW/DESCRIBE/EXPLAIN 开头 |

### 请求参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `description` | string (1-2000) | ✅ | 查询需求描述 |
| `tables` | string[] | 否 | 允许查询的表名白名单 |

### 返回

```json
{
  "sql": "SELECT * FROM sys_user WHERE tenant_id = '000000' AND deleted = 0",
  "tenantIsolated": true
}
```

生成的 SQL 已自动注入租户隔离条件，**不会自动执行**，需人工审核。

---

## 4. 审计分析器 — 智能安全分析

**端点**: `POST /api/ai/audit/analyze`

提交系统日志数据，AI 从多维度分析安全风险。

### 请求参数

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `logType` | enum | 否 | `login` / `api_access` / `rate_limit` / `error` / `all` |
| `timeRange` | string | 否 | 时间范围描述 |
| `logData` | string (1-10000) | ✅ | 原始日志数据 |

### 返回

```json
{
  "riskLevel": "medium",
  "summary": "检测到 3 次可疑登录尝试，建议关注",
  "findings": [
    {
      "type": "login_failure",
      "severity": "medium",
      "description": "IP 192.168.1.100 在 5 分钟内尝试登录 12 次",
      "evidence": "[2024-01-01 10:00:00] login_failed ...",
      "recommendation": "建议对该 IP 临时加入黑名单"
    }
  ],
  "statistics": { "totalEvents": 150, "uniqueIps": 23, "topEventType": "login_failure" }
}
```

---

## 5. 配置审查器 — 配置安全检查

**端点**: `POST /api/ai/config/review`

审查 `.env`、`docker-compose.yml` 等配置文件，自动发现安全漏洞。

### 检查项

| 类别 | 检测内容 |
|------|----------|
| 弱密码 | 检测 `admin`、`123456` 等弱密码 |
| 默认密钥 | 检测 `CHANGE_TO_*`、`DEMO_ONLY_*` 等占位符 |
| 公网暴露 | 检测 Redis/MySQL 等端口是否暴露到公网 |
| Root 账户 | 检测数据库是否使用 root 账户 |
| CORS 配置 | 检测是否使用了宽松的 `*` 通配符 |
| 明文协议 | 检测是否使用了 HTTP 而非 HTTPS |
| 安全头缺失 | 检测是否缺少 CSP、HSTS 等安全头 |

### 返回

```json
{
  "overallRisk": "medium",
  "summary": "发现 2 个高危问题和 3 个中危问题",
  "issues": [
    {
      "severity": "high",
      "category": "weak_password",
      "title": "Redis 密码过于简单",
      "location": ".env:REDIS_PASSWORD",
      "current": "123456",
      "risk": "攻击者可轻松破解 Redis 密码获取缓存数据",
      "fix": "使用至少 16 位随机密码，包含大小写字母、数字和特殊字符"
    }
  ],
  "complianceScore": 65
}
```

---

## 架构设计

```
bls-admin (前端) ── POST /api/ai/chat/completions ──→ bls-ai-service (:7201)
    │                                                     │
    │  GET/POST/DELETE                                    │ AI Provider 工厂
    │  /api/ai/chat/conversations                         │ ├── DeepSeek
    │                                                     │ ├── OpenAI
    └──────────────────→ bls-server (:7001)               │ ├── 通义千问
                              │                           │ └── 自定义
                         MySQL (ai_conversation           │
                                ai_conversation_message)  │
```

- **bls-ai-service**: 独立微服务，负责调用大模型并流式返回结果
- **bls-server**: 负责对话历史 CRUD 存储
- **Nginx**: `/api/ai/chat/conversations` 路由到 bls-server，其他 `/api/ai/*` 路由到 bls-ai-service，SSE 流式路径关闭 buffering

## 安全设计

| 层面 | 措施 |
|------|------|
| **认证** | JWT Bearer Token（与 bls-server 共享密钥） |
| **限流** | Redis 滑动窗口，默认 10 次/分钟/用户 |
| **SQL 防护** | 四重防护确保只生成只读 SQL |
| **租户隔离** | 从 JWT 提取 tenantId 自动注入 SQL |
| **审计日志** | 所有 AI 请求写入结构化日志 |
| **输入校验** | 全部使用 Zod schema 严格验证 |

> ⚠️ AI 生成的 SQL/配置**不会自动执行**，需人工审核后通过安全接口执行。
