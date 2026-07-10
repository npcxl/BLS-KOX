# 快速开始

## 环境要求

- Node.js ≥ 20
- MySQL 8.0
- Redis 7
- Git

## 本地开发

```bash
git clone https://github.com/npcxl/BLS-KOX.git
cd BLS-KOX

# 启动 MySQL + Redis
docker compose up -d mysql redis

# 后端
cd bls-server
cp .env.example .env
npm install
npm run dev  # → http://localhost:6001

# 前端（新终端）
cd ../bls-admin
npm install
npm start    # → http://localhost:8000
```

## 数据库初始化

```bash
mysql -u root -p -h 127.0.0.1 < bls-server/sql/init.sql

# 示例数据
cd bls-server && npx tsx src/scripts/seed.ts
```

## 核心环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_HOST` | MySQL | `127.0.0.1` |
| `DB_PASSWORD` | 密码 | 必填 |
| `DB_NAME` | 数据库 | `bls` |
| `JWT_SECRET` | JWT 密钥 | 生产环境务必改 |
| `REDIS_PASSWORD` | Redis 密码 | 必填 |

## 常见问题

- `ER_NOT_SUPPORTED_AUTH_MODE` → `ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'xxx'`
- `ECONNREFUSED :6379` → `docker compose up -d redis`
