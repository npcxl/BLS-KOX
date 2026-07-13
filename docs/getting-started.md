# 快速开始

## 环境要求

- Node.js ≥ 22
- MySQL 8.0
- Redis 7

## Docker 部署（推荐）

```bash
git clone https://github.com/npcxl/BLS-KOX.git
cd BLS-KOX
cp .env.example .env
# 编辑 .env，修改所有 CHANGE_TO_* 值为强密码
docker compose up -d --build
```

访问：
- 管理端：http://localhost
- API：http://localhost/api
- 健康检查：http://localhost/api/health

## 本地开发

```bash
git clone https://github.com/npcxl/BLS-KOX.git
cd BLS-KOX

# 启动 MySQL + Redis（开发模式暴露端口）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mysql redis

# 后端
cd bls-server
cp .env.example .env
npm install
npm run db:migrate up
npm run dev  # → http://localhost:6001

# 前端（新终端）
cd ../bls-admin
npm install
npm start    # → http://localhost:8000
```

## 数据库初始化

```bash
mysql -u root -p -h 127.0.0.1 < bls-server/sql/init.sql
```

> init.sql 包含完整表结构 + 演示数据（租户、用户、角色、菜单、部门、字典等）。

## 演示账号

init.sql 导入后包含演示数据：

| 项目 | 值 |
|------|-----|
| 默认租户 ID | `000000` |
| 默认密码 | `123456`（通过 `sys_config` 中 `sys.user.defaultPassword` 配置） |
| 配置 | `sys_config` 表含有完整系统参数 |

> ⚠️ 生产环境务必修改 `sys.user.defaultPassword`、`DB_PASSWORD`、`JWT_SECRET`。

## 核心环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_HOST` | MySQL | `127.0.0.1` |
| `DB_PASSWORD` | 密码 | 必填 |
| `DB_NAME` | 数据库 | `bls` |
| `JWT_SECRET` | JWT 密钥 | 生产务必改 |
| `REDIS_PASSWORD` | Redis 密码 | 必填 |

## 健康检查

```bash
curl http://localhost:6001/api/health  # → {"status":"ok"}
curl http://localhost:6001/api/metrics # → Prometheus 指标
```

## 常见问题

- `ER_NOT_SUPPORTED_AUTH_MODE` → MySQL 8.0 认证：`ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'xxx'`
- `ECONNREFUSED :6379` → `docker compose up -d redis`
- `ECONNRESET` 数据库连接 → 检查 `DB_HOST` 和 `DB_PASSWORD`
