#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# health-check.sh — 生产环境健康检查
#
# 检查: Docker 容器 + HTTP 端点 + MySQL/Redis + 可选服务
# 退出码: 0 = 全部通过, 非 0 = 存在失败
# ============================================================

MAX_RETRIES=10
RETRY_INTERVAL=6
FAILED=0
HTTP_PORT="${HTTP_PORT:-8088}"

# 加载环境变量（获取 DB_PASSWORD / REDIS_PASSWORD 等凭证）
ENV_FILE="${SCRIPT_DIR:-$(dirname "$0")}/../env/.env.production"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../env/.env.production" ]; then
  set -a
  source "$SCRIPT_DIR/../env/.env.production"
  set +a
fi

check() {
  local name="$1"
  local cmd="$2"
  local required="${3:-true}"

  for i in $(seq 1 "$MAX_RETRIES"); do
    if eval "$cmd" > /dev/null 2>&1; then
      echo "  ✓ $name"
      return 0
    fi
    if [ "$i" -lt "$MAX_RETRIES" ]; then
      sleep "$RETRY_INTERVAL"
    fi
  done

  if [ "$required" = "true" ]; then
    echo "  ✗ $name (失败)"
    FAILED=1
  else
    echo "  - $name (跳过，非必需)"
  fi
}

echo "健康检查 (最多重试 $MAX_RETRIES 次, 间隔 ${RETRY_INTERVAL}s):"
echo ""

# Docker 容器状态
check "bls-nginx"       "docker inspect bls-nginx --format='{{.State.Running}}' 2>/dev/null | grep -q true"
check "bls-admin"       "docker inspect bls-admin --format='{{.State.Running}}' 2>/dev/null | grep -q true"
check "bls-server"      "docker inspect bls-server --format='{{.State.Health.Status}}' 2>/dev/null | grep -q healthy"
check "bls-ai-service"  "docker inspect bls-ai-service --format='{{.State.Health.Status}}' 2>/dev/null | grep -q healthy"
check "bls-mysql"       "docker inspect bls-mysql --format='{{.State.Health.Status}}' 2>/dev/null | grep -q healthy"
check "bls-redis"       "docker inspect bls-redis --format='{{.State.Health.Status}}' 2>/dev/null | grep -q healthy"
check "bls-minio"       "docker inspect bls-minio --format='{{.State.Running}}' 2>/dev/null | grep -q true"

# HTTP 端点
check "nginx root"      "curl -sf -o /dev/null --max-time 5 http://localhost:$HTTP_PORT/"
check "koa health"      "curl -sf --max-time 5 http://localhost:$HTTP_PORT/api/health | grep -q ok"

# AI 服务健康（通过 docker exec 在容器内检查）
check "ai health"       "docker exec bls-ai-service wget -q --spider http://localhost:7201/health 2>/dev/null" true

# MySQL ping（凭证缺失时判定失败）
if [ -n "${DB_PASSWORD:-}" ]; then
  check "mysql ping"    "docker exec bls-mysql mysqladmin ping -h localhost -uroot -p'${DB_PASSWORD}' --silent 2>/dev/null" true
else
  echo "  ✗ mysql ping (失败，DB_PASSWORD 未设置)"
  FAILED=1
fi

# Redis ping（凭证缺失时判定失败）
if [ -n "${REDIS_PASSWORD:-}" ]; then
  check "redis ping"    "docker exec bls-redis redis-cli -a '${REDIS_PASSWORD}' ping 2>/dev/null | grep -q PONG" true
else
  echo "  ✗ redis ping (失败，REDIS_PASSWORD 未设置)"
  FAILED=1
fi

# 可选服务
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q bls-event-service; then
  check "event-service" "docker inspect bls-event-service --format='{{.State.Running}}' 2>/dev/null | grep -q true" true
else
  echo "  - event-service (未启用)"
fi

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q bls-java-server; then
  check "java-server" "docker inspect bls-java-server --format='{{.State.Health.Status}}' 2>/dev/null | grep -q healthy" true
else
  echo "  - java-server (未启用)"
fi

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "✅ 所有健康检查通过"
  exit 0
else
  echo "❌ 健康检查存在失败项"
  exit 1
fi
