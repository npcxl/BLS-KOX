# 服务器首次部署步骤

## 前置条件

- 服务器已安装 Docker 和 Docker Compose Plugin
- 服务器能访问 ghcr.io（GitHub Container Registry）

## 步骤

### 1. 安装 Docker

```bash
curl -fsSL https://get.docker.com | bash
sudo usermod -aG docker $USER
# 重新登录使权限生效
```

### 2. 克隆部署仓库

```bash
git clone git@github.com:npcxl/BLS-KOX-Deploy.git /opt/bls-kox-deploy
cd /opt/bls-kox-deploy
git checkout production
```

### 3. 配置环境变量

```bash
cp env/.env.production.example env/.env.production
vi env/.env.production
```

将所有 `CHANGE_ME` 替换为真实强随机值。

### 4. 登录 GHCR

```bash
# 创建 GitHub Personal Access Token（classic），勾选 read:packages
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

### 5. 首次拉取镜像

```bash
export $(cat env/.env.production | grep -v '^#' | xargs)
docker compose -f docker-compose.prod.yml pull
```

### 6. 初始化数据库

首次启动需要初始化数据库（执行 Init.sql）：

```bash
docker compose -f docker-compose.prod.yml up -d mysql redis minio
# 等待 MySQL 健康
docker compose -f docker-compose.prod.yml ps

# 手动执行初始化 SQL
docker exec -i bls-mysql mysql -uroot -p$DB_PASSWORD $DB_NAME < ../BLS-KOX/sql/Init.sql
```

### 7. 启动所有服务

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 8. 验证

```bash
./scripts/health-check.sh
docker compose -f docker-compose.prod.yml ps
```

访问 `http://服务器IP:8088`
