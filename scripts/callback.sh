#!/usr/bin/env bash
# GitHub Actions → Koa 回调脚本
# 用法: RELEASE_CALLBACK_SECRET=xxx ./scripts/callback.sh <callbackUrl> <taskId> <stage> <status> <progress> <message>

set -euo pipefail

CALLBACK_URL="${1:-}"
TASK_ID="${2:-}"
STAGE="${3:-}"
STATUS="${4:-}"
PROGRESS="${5:-}"
MESSAGE="${6:-}"

if [ -z "$CALLBACK_URL" ] || [ -z "$TASK_ID" ]; then
  echo "用法: RELEASE_CALLBACK_SECRET=xxx $0 <callbackUrl> <taskId> <stage> <status> <progress> <message>"
  exit 1
fi

if [ -z "${RELEASE_CALLBACK_SECRET:-}" ]; then
  echo "❌ RELEASE_CALLBACK_SECRET 未设置，无法签名回调"
  exit 1
fi

TIMESTAMP=$(date +%s%3N)
NONCE=$(openssl rand -hex 16)
TS_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# 用 jq 安全构造 JSON（避免消息中的特殊字符破坏 JSON）
if command -v jq > /dev/null 2>&1; then
  BODY=$(jq -nc \
    --arg taskId "$TASK_ID" \
    --arg stage "$STAGE" \
    --arg status "$STATUS" \
    --arg message "$MESSAGE" \
    --arg timestamp "$TS_ISO" \
    --argjson progress "$PROGRESS" \
    '{ taskId: $taskId, stage: $stage, status: $status, progress: $progress, message: $message, timestamp: $timestamp }')
else
  # fallback：手动转义（仅处理基本字符）
  ESCAPED_MSG=$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g')
  BODY="{\"taskId\":\"${TASK_ID}\",\"stage\":\"${STAGE}\",\"status\":\"${STATUS}\",\"progress\":${PROGRESS},\"message\":\"${ESCAPED_MSG}\",\"timestamp\":\"${TS_ISO}\"}"
fi

# 生成 HMAC-SHA256 签名
PAYLOAD="${TIMESTAMP}\n${NONCE}\n${BODY}"
SIGNATURE=$(printf "${PAYLOAD}" | openssl dgst -sha256 -hmac "${RELEASE_CALLBACK_SECRET}" | awk '{print $2}')

curl -sf -X POST "${CALLBACK_URL}" \
  -H "Content-Type: application/json" \
  -H "X-Release-Timestamp: ${TIMESTAMP}" \
  -H "X-Release-Nonce: ${NONCE}" \
  -H "X-Release-Signature: ${SIGNATURE}" \
  -d "${BODY}"
