#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# deploy.sh — 生产环境部署脚本
#
# 用法: ./scripts/deploy.sh 1.0.1
#
# 要求:
#   - 生产服务器不执行任何 build/npm install/maven 操作
#   - 只允许 docker compose pull / up / ps / logs
#   - 失败自动回滚到上一版本
#   - 不删除任何数据 Volume
# ============================================================

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "❌ 用法: $0 <version>"
  echo "   示例: $0 1.0.1"
  exit 1
fi

if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "❌ 无效版本号: $VERSION (需要 x.y.z 格式)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCK_FILE="$ROOT_DIR/.deploy.lock"
LOG_DIR="$ROOT_DIR/logs"
DEPLOY_LOG="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"
VERSION_FILE="$ROOT_DIR/.last-version"
ENV_FILE="$ROOT_DIR/env/.env.production"

# 创建日志目录
mkdir -p "$LOG_DIR"

# 文件锁（防止并发部署）
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "❌ 另一个部署进程正在运行，请稍后重试"
  exit 1
fi

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$DEPLOY_LOG"
}

cd "$ROOT_DIR"

log "============================================"
log "开始部署版本: $VERSION"
log "============================================"

# 1. 记录上一个版本
PREV_VERSION=""
if [ -f "$VERSION_FILE" ]; then
  PREV_VERSION=$(cat "$VERSION_FILE" | tr -d '\n\r' | xargs)
  log "上一版本: $PREV_VERSION"
fi

# 2. 更新 .env.production 中的 APP_VERSION
if [ -f "$ENV_FILE" ]; then
  if grep -q '^APP_VERSION=' "$ENV_FILE"; then
    sed -i "s/^APP_VERSION=.*/APP_VERSION=$VERSION/" "$ENV_FILE"
  else
    echo "APP_VERSION=$VERSION" >> "$ENV_FILE"
  fi
  log "✓ APP_VERSION 已更新为 $VERSION"
else
  log "⚠️  未找到 $ENV_FILE，请手动创建"
  exit 1
fi

# 3. 校验 Compose 配置
log "校验 docker-compose.prod.yml..."
export APP_VERSION="$VERSION"
docker compose -f docker-compose.prod.yml config --quiet
log "✓ Compose 配置校验通过"

# 4. 拉取指定版本镜像
log "拉取镜像..."
docker compose -f docker-compose.prod.yml pull bls-admin bls-server bls-ai-service 2>&1 | tee -a "$DEPLOY_LOG"

# 可选服务
docker compose -f docker-compose.prod.yml pull bls-event-service 2>&1 | tee -a "$DEPLOY_LOG" || true
docker compose -f docker-compose.prod.yml pull bls-java-server 2>&1 | tee -a "$DEPLOY_LOG" || true
log "✓ 镜像拉取完成"

# 5. 替换容器
log "更新服务容器..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans bls-admin bls-server bls-ai-service 2>&1 | tee -a "$DEPLOY_LOG"

# 6. 健康检查
log "执行健康检查..."
sleep 5
if "$SCRIPT_DIR/health-check.sh"; then
  log "✅ 健康检查通过"

  # 保存版本记录
  echo "$VERSION" > "$VERSION_FILE"
  log "✓ 版本记录已更新: $VERSION"

  # 显示状态
  log "当前容器状态:"
  docker compose -f docker-compose.prod.yml ps | tee -a "$DEPLOY_LOG"

  log "============================================"
  log "✅ 部署成功: $VERSION"
  log "部署日志: $DEPLOY_LOG"
  log "============================================"
else
  log "❌ 健康检查失败"

  # 回滚
  if [ -n "$PREV_VERSION" ]; then
    log "正在回滚到上一版本: $PREV_VERSION"
    if "$SCRIPT_DIR/rollback.sh" "$PREV_VERSION"; then
      log "✅ 已回滚到 $PREV_VERSION"
    else
      log "❌ 回滚失败，请手动处理"
    fi
  else
    log "⚠️  无上一版本可回滚，请手动排查"
  fi
  exit 1
fi
