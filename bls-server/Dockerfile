FROM docker.1ms.run/library/node:22-alpine AS builder

ARG APP_VERSION
ARG COMMIT_HASH

WORKDIR /app

# Alpine 包源换成阿里云（默认 dl-cdn.alpinelinux.org 在国内很慢/易超时）
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
 && apk add --no-cache python3 make g++

RUN npm config set registry https://registry.npmmirror.com

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ====== Stage 2: Runtime ======
FROM docker.1ms.run/library/node:22-alpine AS runtime

ARG APP_VERSION
ARG COMMIT_HASH

LABEL org.opencontainers.image.title="BLS-KOX Server"
LABEL org.opencontainers.image.version="${APP_VERSION}"
LABEL org.opencontainers.image.revision="${COMMIT_HASH}"

WORKDIR /app

ENV NODE_ENV=production
ENV APP_PORT=7001

RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
 && apk add --no-cache python3 make g++ wget

RUN addgroup -g 2000 bls && adduser -u 2000 -G bls -D bls

RUN npm config set registry https://registry.npmmirror.com

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force && apk del python3 make g++

COPY --from=builder /app/dist ./dist

RUN chown -R bls:bls /app

USER bls

EXPOSE 7001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:7001/api/health || exit 1

CMD ["node", "dist/app.js"]
