#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# rollback.sh — 回滚到指定版本
#
# 用法: ./scripts/rollback.sh 1.0.0 "bls-admin bls-server"
#       ./scripts/rollback.sh              (自动读取上一版本)
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$ROOT_DIR/.last-version"
PREV_VERSION_FILE="$ROOT_DIR/.previous-version"
LAST_SERVICES_FILE="$ROOT_DIR/.last-services"
ENV_FILE="$ROOT_DIR/env/.env.production"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"
LOCK_FILE="$ROOT_DIR/.deploy.lock"
LOG_DIR="${BLS_LOG_DIR:-/var/log/bls-kox}"
ROLLBACK_LOG="$LOG_DIR/rollback-$(date +%Y%m%d-%H%M%S).log"

mkdir -p "$LOG_DIR"

# 使用不同 fd 避免与 deploy.sh 锁冲突
exec 202>"$LOCK_FILE"
if ! flock -n 202; then
  echo "❌ 另一个部署进程正在运行，请稍后重试"
  exit 1
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$ROLLBACK_LOG"; }

cd "$ROOT_DIR"

VERSION="${1:-}"
SERVICES="${2:-}"

if [ -z "$VERSION" ]; then
  for f in "$PREV_VERSION_FILE" "$VERSION_FILE"; do
    if [ -f "$f" ]; then
      VERSION=$(cat "$f" | tr -d '\n\r' | xargs)
      break
    fi
  done
  if [ -z "$VERSION" ]; then
    log "❌ 未指定版本，且无版本记录"
    exit 1
  fi
  log "自动读取版本: $VERSION"
fi

# 如果没传服务列表，从上次部署记录读取
if [ -z "$SERVICES" ]; then
  if [ -f "$LAST_SERVICES_FILE" ]; then
    SERVICES=$(cat "$LAST_SERVICES_FILE" | tr -d '\n\r' | xargs)
    log "读取上次服务列表: $SERVICES"
  else
    SERVICES="bls-admin bls-server bls-ai-service"
    log "使用默认服务列表: $SERVICES"
  fi
fi

log "============================================"
log "回滚到版本: $VERSION"
log "服务列表: $SERVICES"
log "============================================"

if [ -f "$ENV_FILE" ]; then
  if grep -q '^APP_VERSION=' "$ENV_FILE"; then
    sed -i "s/^APP_VERSION=.*/APP_VERSION=$VERSION/" "$ENV_FILE"
  else
    echo "APP_VERSION=$VERSION" >> "$ENV_FILE"
  fi
fi

log "拉取镜像..."
for svc in $SERVICES; do
  log "  拉取 $svc ..."
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull "$svc" 2>&1 | tee -a "$ROLLBACK_LOG"
done

log "重启服务..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans $SERVICES 2>&1 | tee -a "$ROLLBACK_LOG"

sleep 5

if "$SCRIPT_DIR/health-check.sh"; then
  echo "$VERSION" > "$VERSION_FILE"
  echo "$SERVICES" > "$LAST_SERVICES_FILE"
  log "✅ 回滚成功: $VERSION"
else
  log "❌ 回滚后健康检查仍失败"
  exit 1
fi
