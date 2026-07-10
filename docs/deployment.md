# 部署指南

## Docker Compose

```bash
git clone https://github.com/npcxl/BLS-KOX.git
cd BLS-KOX
docker compose up -d
```

服务端口：
- 前端 Nginx：`:80`
- 后端 API：`:7001`（通过 Nginx 反向代理）

## 生产环境

### 环境变量

生产环境务必修改：
- `JWT_SECRET` — 随机长字符串
- `DB_PASSWORD` — 强密码
- `REDIS_PASSWORD` — 强密码
- `NODE_ENV=production`

### Nginx 配置

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://bls-server:7001;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://bls-admin:8000;
    }
}
```

### 安全建议

- 开启 `TRUST_PROXY=true`
- Redis 绑定内网 IP
- MySQL 绑定内网 IP
- 使用 HTTPS + 证书
- 定期备份数据库
