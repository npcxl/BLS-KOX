# 日常发布流程

## 开发者操作

### 1. 本地修改代码并提交

```bash
git add .
git commit -m "feat: 新增XX功能"
```

### 2. 更新版本号

```bash
# 补丁版本 (1.0.0 → 1.0.1)
npm run release:patch

# 次版本 (1.0.0 → 1.1.0)
npm run release:minor

# 主版本 (1.0.0 → 2.0.0)
npm run release:major
```

### 3. 推送 Tag 触发构建

```bash
git add VERSION package.json bls-*/package.json
git commit -m "chore: bump version to 1.0.1"
git tag v1.0.1
git push origin main --tags
```

### 4. GitHub Actions 自动执行

推送 Tag 后自动触发：

1. 校验版本号
2. 并行构建 5 个 Docker 镜像
3. 推送到 ghcr.io（带版本标签 + commit SHA + latest）
4. SSH 登录生产服务器
5. 执行 `deploy.sh 1.0.1`

### 5. 检查部署状态

查看 GitHub Actions 日志确认部署成功，或手动检查：

```bash
ssh user@server
cd /opt/bls-kox-deploy
docker compose -f docker-compose.prod.yml ps
./scripts/health-check.sh
```
