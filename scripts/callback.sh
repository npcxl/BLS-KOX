#!/usr/bin/env bash
# GitHub Actions → Koa 回调脚本
# 用法: ./scripts/callback.sh <callbackUrl> <taskId> <stage> <status> <progress> <message>

CALLBACK_URL="${1:-}"
TASK_ID="${2:-}"
STAGE="${3:-}"
STATUS="${4:-}"
PROGRESS="${5:-}"
MESSAGE="${6:-}"

if [ -z "$CALLBACK_URL" ] || [ -z "$TASK_ID" ]; then
  echo "用法: $0 <callbackUrl> <taskId> <stage> <status> <progress> <message>"
  exit 1
fi

TIMESTAMP=$(date +%s%3N)
NONCE=$(openssl rand -hex 16)
BODY="{\"taskId\":\"${TASK_ID}\",\"stage\":\"${STAGE}\",\"status\":\"${STATUS}\",\"progress\":${PROGRESS},\"message\":\"${MESSAGE}\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"

# 生成 HMAC-SHA256 签名
SIGNATURE=$(echo -n "${TIMESTAMP}
${NONCE}
${BODY}" | openssl dgst -sha256 -hmac "${RELEASE_CALLBACK_SECRET:-}" | awk '{print $2}')

curl -s -X POST "${CALLBACK_URL}" \
  -H "Content-Type: application/json" \
  -H "X-Release-Timestamp: ${TIMESTAMP}" \
  -H "X-Release-Nonce: ${NONCE}" \
  -H "X-Release-Signature: ${SIGNATURE}" \
  -d "${BODY}" || echo "Callback failed (ignored)"
