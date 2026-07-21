FROM node:22-alpine AS builder

WORKDIR /app

# 安装依赖（含 devDependencies，供 tsc 编译）
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# 编译 TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# 移除 devDependencies，只保留生产依赖
RUN npm prune --omit=dev

# ====== Production ======
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 7201

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:7201/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["node", "dist/app.js"]
