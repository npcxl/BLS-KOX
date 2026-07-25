# 回滚流程

## 自动回滚

部署脚本 `deploy.sh` 在健康检查失败时会自动回滚到上一版本。

## 手动回滚

### 回滚到上一版本

```bash
cd /opt/bls-kox-deploy
./scripts/rollback.sh
```

### 回滚到指定版本

```bash
cd /opt/bls-kox-deploy
./scripts/rollback.sh 1.0.0
```

### 验证回滚

```bash
./scripts/health-check.sh
docker compose -f docker-compose.prod.yml ps
```

## 版本记录

版本记录保存在 `.last-version` 文件中。
