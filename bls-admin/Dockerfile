# BLS-KOX Admin — Multi-stage build
# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# 配置 npm 淘宝镜像源
RUN npm config set registry https://registry.npmmirror.com

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
