#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# rollback.sh — 回滚到指定版本
#
# 用法:
#   ./scripts/rollback.sh 1.0.0       → 回滚到指定版本
#   ./scripts/rollback.sh             → 自动读取上一版本
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$ROOT_DIR/.last-version"
ENV_FILE="$ROOT_DIR/env/.env.production"
LOCK_FILE="$ROOT_DIR/.deploy.lock"
LOG_DIR="$ROOT_DIR/logs"
ROLLBACK_LOG="$LOG_DIR/rollback-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$LOG_DIR"

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "❌ 另一个部署进程正在运行，请稍后重试"
  exit 1
fi

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$ROLLBACK_LOG"
}

cd "$ROOT_DIR"

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  if [ -f "$VERSION_FILE" ]; then
    VERSION=$(cat "$VERSION_FILE" | tr -d '\n\r' | xargs)
    log "自动读取上一版本: $VERSION"
  else
    log "❌ 未指定版本，且无 .last-version 记录"
    exit 1
  fi
fi

log "============================================"
log "回滚到版本: $VERSION"
log "============================================"

# 更新 APP_VERSION
if [ -f "$ENV_FILE" ]; then
  if grep -q '^APP_VERSION=' "$ENV_FILE"; then
    sed -i "s/^APP_VERSION=.*/APP_VERSION=$VERSION/" "$ENV_FILE"
  else
    echo "APP_VERSION=$VERSION" >> "$ENV_FILE"
  fi
fi

export APP_VERSION="$VERSION"

log "拉取镜像..."
docker compose -f docker-compose.prod.yml pull bls-admin bls-server bls-ai-service 2>&1 | tee -a "$ROLLBACK_LOG"

log "重启服务..."
docker compose -f docker-compose.prod.yml up -d --remove-orphans bls-admin bls-server bls-ai-service 2>&1 | tee -a "$ROLLBACK_LOG"

sleep 5

if "$SCRIPT_DIR/health-check.sh"; then
  echo "$VERSION" > "$VERSION_FILE"
  log "✅ 回滚成功: $VERSION"
else
  log "❌ 回滚后健康检查仍失败，请手动排查"
  exit 1
fi
