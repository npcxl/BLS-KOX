# ====== Stage 1: Build ======
FROM node:22-alpine AS builder

ARG APP_VERSION
ARG COMMIT_HASH

WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .

# 生成 version.json
RUN echo "{\"version\":\"${APP_VERSION:-unknown}\",\"commitHash\":\"${COMMIT_HASH:-unknown}\",\"buildTime\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > dist/version.json 2>/dev/null || true
RUN node -e "const fs=require('fs');const v={version:process.env.APP_VERSION||require('./package.json').version,commitHash:process.env.COMMIT_HASH||'unknown',buildTime:new Date().toISOString()};fs.writeFileSync('dist/version.json',JSON.stringify(v));" 2>/dev/null || true

RUN npm run build

# 确保 version.json 在构建产物中
RUN if [ -d dist ] && [ ! -f dist/version.json ]; then \
      node -e "const fs=require('fs');const v={version:'${APP_VERSION:-unknown}',commitHash:'${COMMIT_HASH:-unknown}',buildTime:new Date().toISOString()};fs.writeFileSync('dist/version.json',JSON.stringify(v));"; \
    fi

# ====== Stage 2: Serve ======
FROM nginx:alpine

ARG APP_VERSION
ARG COMMIT_HASH

LABEL org.opencontainers.image.title="BLS-KOX Admin"
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.revision="${COMMIT_HASH}"

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1
