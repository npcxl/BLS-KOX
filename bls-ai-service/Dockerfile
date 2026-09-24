# ====== Stage 1: Build ======
# 国内构建：node 基础镜像走 docker.1ms.run、npm 走 npmmirror（与 bls-server/Dockerfile 一致）
FROM docker.1ms.run/library/node:22-alpine AS builder

ARG APP_VERSION
ARG COMMIT_HASH

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm config set registry https://registry.npmmirror.com \
 && npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

RUN npm prune --omit=dev

# ====== Stage 2: Runtime ======
FROM docker.1ms.run/library/node:22-alpine

ARG APP_VERSION
ARG COMMIT_HASH

LABEL org.opencontainers.image.title="BLS-KOX AI Service"
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.revision="${COMMIT_HASH}"

WORKDIR /app

RUN addgroup -g 2000 bls && adduser -u 2000 -G bls -D bls

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

RUN chown -R bls:bls /app

USER bls

EXPOSE 7201

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7201/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/app.js"]
