# BLS-KOX Server — Multi-stage build
# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# argon2 原生模块编译依赖
RUN apk add --no-cache python3 make g++

# 配置 npm 淘宝镜像源
RUN npm config set registry https://registry.npmmirror.com

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV APP_PORT=7001

# argon2 原生模块编译依赖（生产阶段也需要）+ wget for healthcheck
RUN apk add --no-cache python3 make g++ wget

# 配置 npm 淘宝镜像源
RUN npm config set registry https://registry.npmmirror.com

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force && apk del python3 make g++

COPY --from=builder /app/dist ./dist

EXPOSE 7001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:7001/api/health || exit 1

CMD ["node", "dist/app.js"]
