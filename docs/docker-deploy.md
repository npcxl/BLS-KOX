# BLS-KOX Docker 部署指南

## 前置条件

- Docker Desktop 已安装并运行
- 已配置 Docker 镜像加速器（国内必需）

## 快速启动

```powershell
# 进入项目目录
cd c:\git-bls\BLS-KOX

# 一条命令启动所有服务
docker compose --env-file .env.docker down -v --remove-orphans && docker compose --env-file .env.docker up -d --build
```

## 访问地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端管理台 | http://localhost | Nginx 统一入口 |
| MinIO 控制台 | http://localhost:9001 | 对象存储管理 |
| API 健康检查 | http://localhost/api/health | 后端健康状态 |

## 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 超级管理员 | `superadmin` | `123456` |
| 租户管理员 | `admin` | `123456` |
| MinIO 管理 | `minioadmin` | `minioadmin` |

## 服务架构

```
Browser → Nginx(80) → bls-admin(前端 SPA)
                    → bls-server(后端 Koa API :7001)
                    → minio(对象存储 :9000)

bls-server → mysql(3306) + redis(6379) + minio(9000)
```

### 容器清单

| 容器 | 镜像 | 端口 | 说明 |
|------|------|------|------|
| bls-nginx | nginx:alpine | 80 | 反向代理 |
| bls-admin | 构建 | - | 前端 SPA |
| bls-server | 构建 | 7001 | 后端 Koa |
| bls-mysql | mysql:8.0 | 3306 | 数据库 |
| bls-redis | redis:7-alpine | 6379 | 缓存 |
| bls-minio | minio/minio | 9000/9001 | 对象存储 |
| bls-minio-init | minio/mc | - | 初始化 Bucket |
| bls-java-server | 构建 | 8080 | 后端 Java（可选） |

## 常用命令

### 查看状态
```powershell
docker compose ps
```

### 查看日志
```powershell
# 所有服务
docker compose logs -f

# 单个服务
docker compose logs -f bls-server
```

### 重建单个服务
```powershell
docker compose --env-file .env.docker up -d --build bls-server
```

### 完整重建（清数据）
```powershell
docker compose --env-file .env.docker down -v --remove-orphans
docker compose --env-file .env.docker up -d --build
```

### 停止服务
```powershell
docker compose --env-file .env.docker down
```

## 切换后端（Koa ↔ Java）

Java 服务使用 `profiles: java`，默认不启动。

### 启动 Java 后端
```powershell
# 先编译 Java 项目
cd bls-java-server
mvn clean package -DskipTests

# 停止 Koa，启动 Java
cd ..
docker compose --env-file .env.docker stop bls-server
docker compose --env-file .env.docker --profile java up -d --build bls-java-server
```

### 切回 Koa 后端
```powershell
docker compose --env-file .env.docker --profile java stop bls-java-server
docker compose --env-file .env.docker up -d bls-server
```

## 环境变量说明

配置文件：`.env.docker`

| 变量 | 说明 | 示例 |
|------|------|------|
| DB_HOST | 数据库地址 | mysql |
| DB_PORT | 数据库端口 | 3306 |
| DB_USER | 数据库用户 | root |
| DB_PASSWORD | 数据库密码 | xl010520 |
| DB_NAME | 数据库名 | kox |
| REDIS_HOST | Redis 地址 | redis |
| REDIS_PORT | Redis 端口 | 6379 |
| REDIS_PASSWORD | Redis 密码 | 自定义 |
| JWT_SECRET | JWT 签名密钥 | 至少 32 位 |
| CORS_ORIGINS | 允许的跨域域名 | http://localhost |
| API_SIGN_SECRET | 防重放签名密钥 | 自定义 |

## 故障排查

### 502 Bad Gateway
```powershell
docker compose --env-file .env.docker restart bls-nginx
```

### 数据库数据不完整
```powershell
# 删除数据卷重建
docker compose --env-file .env.docker down -v --remove-orphans
docker compose --env-file .env.docker up -d --build
```

### 镜像拉取失败
在 Docker Desktop 设置中配置镜像加速器：
```json
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me"
  ]
}
```

### MinIO 图片 403
```powershell
docker exec bls-minio mc anonymous set public local/public-assets
```
