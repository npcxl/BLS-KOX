#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# deploy.sh — 生产环境部署脚本
#
# 用法: ./scripts/deploy.sh 1.0.1 "bls-admin bls-server bls-ai-service"
# ============================================================

VERSION="${1:-}"
SERVICES="${2:-bls-admin bls-server bls-ai-service}"

if [ -z "$VERSION" ]; then
  echo "❌ 用法: $0 <version> [services]"
  echo "   示例: $0 1.0.1 \"bls-admin bls-server bls-ai-service\""
  exit 1
fi

if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "❌ 无效版本号: $VERSION (需要 x.y.z 格式)"
  exit 1
fi

# 服务白名单 + 命令注入防护
ALLOWED_SERVICES="bls-admin bls-server bls-ai-service bls-event-service bls-java-server"
for svc in $SERVICES; do
  if ! echo " $ALLOWED_SERVICES " | grep -q " $svc "; then
    echo "❌ 非法服务名: $svc (白名单: $ALLOWED_SERVICES)"
    exit 1
  fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCK_FILE="$ROOT_DIR/.deploy.lock"
LOG_DIR="${BLS_LOG_DIR:-/var/log/bls-kox}"
DEPLOY_LOG="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"
VERSION_FILE="$ROOT_DIR/.last-version"
PREV_VERSION_FILE="$ROOT_DIR/.previous-version"
ENV_FILE="$ROOT_DIR/env/.env.production"
COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"

mkdir -p "$LOG_DIR"

exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "❌ 另一个部署进程正在运行，请稍后重试"
  exit 1
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$DEPLOY_LOG"; }

cd "$ROOT_DIR"

log "============================================"
log "开始部署版本: $VERSION"
log "服务列表: $SERVICES"
log "============================================"

# 1. 保存上一版本
PREV_VERSION=""
if [ -f "$VERSION_FILE" ]; then
  PREV_VERSION=$(cat "$VERSION_FILE" | tr -d '\n\r' | xargs)
  log "上一版本: $PREV_VERSION"
  echo "$PREV_VERSION" > "$PREV_VERSION_FILE"
fi

# 2. 更新 APP_VERSION
if [ -f "$ENV_FILE" ]; then
  if grep -q '^APP_VERSION=' "$ENV_FILE"; then
    sed -i "s/^APP_VERSION=.*/APP_VERSION=$VERSION/" "$ENV_FILE"
  else
    echo "APP_VERSION=$VERSION" >> "$ENV_FILE"
  fi
  log "✓ APP_VERSION 已更新为 $VERSION"
else
  log "❌ 未找到 $ENV_FILE"
  exit 1
fi

# 3. 校验 Compose
log "校验 Compose 配置..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet
log "✓ Compose 配置校验通过"

# 4. 拉取镜像
log "拉取镜像..."
for svc in $SERVICES; do
  log "  拉取 $svc ..."
  if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull "$svc" 2>&1 | tee -a "$DEPLOY_LOG"; then
    log "❌ 镜像拉取失败: $svc"
    exit 1
  fi
done
log "✓ 镜像拉取完成"

# 5. 更新容器
log "更新服务容器..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans $SERVICES 2>&1 | tee -a "$DEPLOY_LOG"

# 6. 健康检查
log "执行健康检查..."
sleep 5
if "$SCRIPT_DIR/health-check.sh"; then
  log "✅ 健康检查通过"
  echo "$VERSION" > "$VERSION_FILE"
  log "✓ 版本记录已更新: $VERSION"
  log "当前容器状态:"
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps | tee -a "$DEPLOY_LOG"
  log "============================================"
  log "✅ 部署成功: $VERSION"
  log "部署日志: $DEPLOY_LOG"
  log "============================================"
else
  log "❌ 健康检查失败"
  if [ -n "$PREV_VERSION" ]; then
    log "正在回滚到上一版本: $PREV_VERSION"
    if grep -q '^APP_VERSION=' "$ENV_FILE"; then
      sed -i "s/^APP_VERSION=.*/APP_VERSION=$PREV_VERSION/" "$ENV_FILE"
    fi
    if "$SCRIPT_DIR/rollback.sh" "$PREV_VERSION"; then
      log "✅ 已回滚到 $PREV_VERSION"
    else
      log "❌ 回滚失败，请手动处理"
      exit 1
    fi
  else
    log "⚠️  无上一版本可回滚，请手动排查"
  fi
  exit 1
fi
