# 快速开始

> ⚠️ **分支说明**：当前文档基于 `master` 分支。`dev` 分支包含最新功能和实验性特性，可能存在未修复的 Bug，生产环境请使用 `master` 分支。

## 选择后端

本项目包含两套后端，API 完全兼容，**选一套即可**：

| 后端 | 语言 | 端口 | 适合 |
|------|------|------|------|
| **bls-server** | TypeScript / Koa 3 | 6001 | Node.js 开发者 |
| **bls-java-server** | Java 21 / Spring Boot 3 | 8080 | Java 开发者 |

> Git clone 后两套代码都在。如果只用一套，可运行清理脚本：
> ```powershell
> .\scripts\cleanup-backend.ps1   # 交互式选择删除 Koa 或 Java
> ```

## 环境要求

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | ≥ 22 | Koa 后端 + 前端 |
| Java | ≥ 21 | Java 后端（可选） |
| Maven | ≥ 3.8 | Java 构建（可选） |
| MySQL | 8.0 | 数据库 |
| Redis | 7.0 | 缓存 / 限流 |
| Docker | 20.10+ | 一键部署（可选） |

---

## 方式一：Docker 一键部署（最快上手）

```bash
git clone https://github.com/npcxl/BLS-KOX.git && cd BLS-KOX

# 配置环境变量
cp .env.example .env
# 编辑 .env，把所有 CHANGE_TO_* 改成强密码

# 启动全部服务（默认 Koa 后端 + AI 服务）
docker compose up -d --build
```

启动成功访问：**http://localhost**

默认账号：`superadmin` / `123456`

> **KOX-AI 对话**：登录后左侧菜单点击「KOX-AI」即可使用 AI 智能助手，需要在 `.env` 中配置 `OPENAI_API_KEY`。

> 想用 **Java 后端**？加上 profile：
> ```bash
> docker compose --profile java up -d --build bls-java-server
> # 然后修改 nginx.conf 的 upstream 指向 bls-java-server:8080
> ```

---

## 方式二：Koa 后端 + 前端（Node.js 开发者）

```bash
git clone https://github.com/npcxl/BLS-KOX.git && cd BLS-KOX

# 1. 启动 MySQL + Redis
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mysql redis

# 2. 初始化数据库
docker compose exec mysql mysql -uroot -p你的密码 kox < /docker-entrypoint-initdb.d/Init.sql
# 或直接用客户端连接 localhost:3306 执行 sql/Init.sql

# 3. 启动 Koa 后端
cd bls-server
cp .env.example .env
# 编辑 .env 修改 DB_HOST=127.0.0.1, DB_PASSWORD 等
npm install
npm run dev                  # http://localhost:6001

# 4. 新终端，启动前端
cd ../bls-admin
npm install
# 编辑 config/proxy.ts，target 改为 http://localhost:6001
npm start                    # http://localhost:8000
```

---

## 方式三：Java 后端 + 前端（Java 开发者）

```bash
git clone https://github.com/npcxl/BLS-KOX.git && cd BLS-KOX

# 1. 启动 MySQL + Redis
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mysql redis

# 2. 初始化数据库
# 用 Navicat / DBeaver 连接 localhost:3306，执行 sql/Init.sql

# 3. 启动 Java 后端
cd bls-java-server
# 编辑 src/main/resources/application.yml，修改数据库连接
mvn clean package -DskipTests
java -jar target/bls-java-server-1.0.0.jar     # http://localhost:8080

# 4. 新终端，启动前端
cd ../bls-admin
npm install
# 前端 proxy 默认指向 localhost:8080，无需修改
npm start                    # http://localhost:8000
```

> API 文档：启动 Java 后端后访问 http://localhost:8080/doc.html

---

## 数据库初始化

如果 Docker 没有自动初始化，手动执行：

```bash
mysql -u root -p -h 127.0.0.1 < sql/Init.sql
```

> `sql/Init.sql` 包含完整表结构 + 演示数据（租户、用户、角色、菜单、字典等）。

---

## 演示账号

| 项目 | 值 |
|------|-----|
| 默认租户 | `000000` |
| 超级管理员 | `superadmin` / `123456` |
| 租户管理员 | `admin` / `123456`（租户 `100000`） |

> ⚠️ 生产环境务必修改密码！详见 [SECURITY.md](../SECURITY.md)。

---

## 切换后端（Koa ↔ Java）

### 本地开发

修改 `bls-admin/config/proxy.ts`：

```typescript
// 使用 Koa
target: 'http://localhost:6001'

// 使用 Java
target: 'http://localhost:8080'
```

### Docker 部署

修改 `nginx.conf` 中的 upstream：

```nginx
# Koa（默认）
proxy_pass http://bls-server:7001;

# 切换 Java
proxy_pass http://bls-java-server:8080;
```

---

## 核心环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_HOST` | MySQL 地址 | `127.0.0.1` |
| `DB_PASSWORD` | MySQL 密码 | 必填 |
| `DB_NAME` | 数据库名 | `bls` |
| `JWT_SECRET` | JWT 密钥 | 生产务必改 |
| `REDIS_PASSWORD` | Redis 密码 | 必填 |
| `OPENAI_API_KEY` | AI API 密钥 | 使用 AI 功能必填 |
| `AI_PROVIDER` | AI 提供商 | `deepseek` |
| `AI_MODEL` | AI 模型名称 | `deepseek-chat` |

---

## 健康检查

```bash
# Koa 后端
curl http://localhost:6001/api/health    # → {"status":"ok"}

# Java 后端
curl http://localhost:8080/api/health    # → {"status":"ok"}

# Prometheus 指标
curl http://localhost:6001/api/metrics
```

---

## 常见问题

| 问题 | 解决 |
|------|------|
| `ER_NOT_SUPPORTED_AUTH_MODE` | MySQL 8.0 认证模式：`ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'xxx'` |
| `ECONNREFUSED :6379` | Redis 未启动：`docker compose up -d redis` |
| 数据库连接超时 | 检查 `DB_HOST`、`DB_PASSWORD` 是否正确 |
| Java 后端 500 错误 | 确认已执行 `sql/Init.sql` 初始化数据库 |
| 前端代理 404 | 检查 `bls-admin/config/proxy.ts` 的 target 端口是否正确 |
| 主题配置页空白 | 执行 `sql/Init.sql` 或手动插入 `sys_page_column_config` 中 `system_theme` 的列配置 |
