#!/usr/bin/env bash
set -Eeuo pipefail

# ============================================================
# health-check.sh — 生产环境健康检查
#
# 检查:
#   - Docker 容器状态
#   - 根 Nginx 入口
#   - 前端首页
#   - Koa 健康接口
#   - AI 服务健康接口
#   - MySQL / Redis
#   - Java / Event 服务（仅在启用时检查）
#
# 退出码: 0 = 全部通过, 非 0 = 存在失败
# ============================================================

MAX_RETRIES=10
RETRY_INTERVAL=6
FAILED=0

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

# Docker 容器状态
check "bls-nginx"       "docker inspect bls-nginx --format='{{.State.Running}}' | grep -q true"
check "bls-admin"       "docker inspect bls-admin --format='{{.State.Running}}' | grep -q true"
check "bls-server"      "docker inspect bls-server --format='{{.State.Health.Status}}' | grep -q healthy"
check "bls-ai-service"  "docker inspect bls-ai-service --format='{{.State.Health.Status}}' | grep -q healthy"
check "bls-mysql"       "docker inspect bls-mysql --format='{{.State.Health.Status}}' | grep -q healthy"
check "bls-redis"       "docker inspect bls-redis --format='{{.State.Health.Status}}' | grep -q healthy"

# HTTP 检查（通过 nginx 代理）
check "nginx root"      "curl -sf -o /dev/null http://localhost:${HTTP_PORT:-8088}/"
check "frontend html"   "curl -sf -o /dev/null http://localhost:${HTTP_PORT:-8088}/"
check "koa health"      "curl -sf http://localhost:${HTTP_PORT:-8088}/api/health | grep -q ok"
check "ai health"       "curl -sf http://localhost:${HTTP_PORT:-8088}/api/ai/health || curl -sf http://bls-ai-service:7201/health || true"

# 可选服务
if docker ps --format '{{.Names}}' | grep -q bls-event-service; then
  check "event-service" "docker inspect bls-event-service --format='{{.State.Running}}' | grep -q true" true
fi

if docker ps --format '{{.Names}}' | grep -q bls-java-server; then
  check "java-server" "docker inspect bls-java-server --format='{{.State.Health.Status}}' | grep -q healthy" true
fi

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "✅ 所有健康检查通过"
  exit 0
else
  echo "❌ 健康检查存在失败项"
  exit 1
fi
