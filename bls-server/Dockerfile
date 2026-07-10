# BLS-KOX 后端 Dockerfile
# Node 18+，Koa + TypeScript + Kysely + Redis
FROM node:18-alpine

WORKDIR /app

# 依赖
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 编译后的 JS（先执行 npm run build 再 docker build）
COPY dist/ ./dist/

# 资源文件
COPY sql/ ./sql/

EXPOSE 7001

ENV NODE_ENV=production
ENV APP_PORT=7001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:7001/health || exit 1

CMD ["node", "dist/app.js"]
