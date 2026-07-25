# BLS-KOX-Deploy

BLS-KOX 生产环境部署仓库。**私有仓库**，包含生产配置和部署脚本。

## 目录结构

```
├── docker-compose.prod.yml   # 生产 Docker Compose（无 build，纯镜像）
├── nginx.conf                # 根 Nginx 反向代理配置
├── env/
│   └── .env.production.example  # 环境变量模板
├── scripts/
│   ├── deploy.sh             # 部署脚本
│   ├── rollback.sh           # 回滚脚本
│   └── health-check.sh       # 健康检查
└── docs/
    ├── first-deployment.md   # 首次部署指南
    ├── release-process.md    # 发布流程
    └── rollback-process.md   # 回滚流程
```

## 快速命令

```bash
# 部署指定版本
./scripts/deploy.sh 1.0.1

# 回滚到上一版本
./scripts/rollback.sh

# 回滚到指定版本
./scripts/rollback.sh 1.0.0

# 健康检查
./scripts/health-check.sh

# 查看容器状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f bls-server
```

## 安全说明

本仓库为私有仓库。请勿提交任何真实密钥和密码。
