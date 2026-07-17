FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# ====== Production ======
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 7101

ENV NODE_ENV=production

CMD ["node", "dist/app.js"]
